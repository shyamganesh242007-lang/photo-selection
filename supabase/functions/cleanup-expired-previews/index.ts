// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This Supabase Edge Function performs scheduled server-side cleanup of temporary WebP previews
// and database child rows (selections, photos) for galleries completed 24+ hours ago,
// or on-demand manual cleanup for a specific completed gallery.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Designated protected test gallery ID that must never be altered or deleted
const PROTECTED_TEST_GALLERY_ID = 'e47c936b-d91a-470a-942d-deee2fa788f9';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize privileged admin client for server-side cleanup
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let targetGalleryId: string | null = null;
    let isManualRequest = false;

    // Check if request body specifies a target gallery for manual cleanup
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && body.galleryId) {
          targetGalleryId = body.galleryId;
          isManualRequest = true;
        }
      } catch {
        // No body provided, proceed with standard scheduled cleanup
      }
    }

    let galleriesToProcess: Array<{ id: string; name: string }> = [];

    if (targetGalleryId) {
      // Manual cleanup target
      if (targetGalleryId === PROTECTED_TEST_GALLERY_ID) {
        return new Response(
          JSON.stringify({ error: 'Protected test gallery cannot be cleaned up', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: singleG, error: sErr } = await supabase
        .from('galleries')
        .select('id, name, status')
        .eq('id', targetGalleryId)
        .single();

      if (sErr || !singleG) {
        return new Response(
          JSON.stringify({ error: 'Gallery not found', success: false }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (singleG.status !== 'completed' && singleG.status !== 'archived') {
        return new Response(
          JSON.stringify({ error: 'Gallery must be completed before cleanup', success: false }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      galleriesToProcess = [singleG];
    } else {
      // Automatic 24-hour cleanup: completed >= 24 hours ago
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const cutoffTime = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

      const { data: expiredGalleries, error: gErr } = await supabase
        .from('galleries')
        .select('id, name, updated_at')
        .eq('status', 'completed')
        .lt('updated_at', cutoffTime);

      if (gErr) {
        throw new Error(`Database query failed: ${gErr.message}`);
      }
      galleriesToProcess = expiredGalleries || [];
    }

    const results: Array<{ galleryId: string; name: string; deletedCount: number; status: string }> = [];

    for (const gallery of galleriesToProcess) {
      // Security Guard 1: Never delete protected test gallery
      if (gallery.id === PROTECTED_TEST_GALLERY_ID) {
        continue;
      }

      const galleryId = gallery.id;

      try {
        // 1. Query storage objects belonging strictly to this gallery folder
        const { data: storageFiles, error: listErr } = await supabase.storage
          .from('photo-previews')
          .list(galleryId);

        if (listErr) {
          console.warn(`Could not list files for gallery ${galleryId}:`, listErr.message);
        }

        let totalDeleted = 0;
        if (storageFiles && storageFiles.length > 0) {
          // Security Guard 2: Enforce strict path prefix validation
          const pathsToDelete = storageFiles.map((f) => `${galleryId}/${f.name}`);
          for (const p of pathsToDelete) {
            if (!p.startsWith(`${galleryId}/`)) {
              throw new Error(`Cross-gallery safety violation: "${p}" does not belong to "${galleryId}"`);
            }
          }

          // Delete objects in batches
          const BATCH_SIZE = 100;
          for (let i = 0; i < pathsToDelete.length; i += BATCH_SIZE) {
            const batch = pathsToDelete.slice(i, i + BATCH_SIZE);
            const { error: removeErr } = await supabase.storage
              .from('photo-previews')
              .remove(batch);

            if (removeErr) {
              throw removeErr;
            }
            totalDeleted += batch.length;
          }

          // Verification: Verify no objects remain
          const { data: remainingStorage } = await supabase.storage
            .from('photo-previews')
            .list(galleryId);

          if (remainingStorage && remainingStorage.length > 0) {
            throw new Error(`Storage deletion incomplete: ${remainingStorage.length} files still exist`);
          }
        }

        // 2. FK ORDER 1: Delete selections rows for this gallery
        await supabase
          .from('selections')
          .delete()
          .eq('gallery_id', galleryId);

        // 3. FK ORDER 2: Delete photos rows for this gallery
        await supabase
          .from('photos')
          .delete()
          .eq('gallery_id', galleryId);

        // 4. FK ORDER 3: KEEP galleries row for lightweight history!
        // Update cloud cleanup status and timestamp on the gallery record
        await supabase
          .from('galleries')
          .update({
            cloud_cleanup_status: 'deleted',
            cloud_cleanup_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', galleryId);

        const isStorageAlreadyEmpty = !storageFiles || storageFiles.length === 0;

        if (isStorageAlreadyEmpty) {
          results.push({
            galleryId,
            name: gallery.name,
            deletedCount: 0,
            status: 'already_cleaned',
          });
        } else {
          results.push({
            galleryId,
            name: gallery.name,
            deletedCount: totalDeleted,
            status: 'cleaned_successfully',
          });
        }
      } catch (err: any) {
        console.error(`Error cleaning gallery ${galleryId}:`, err);
        try {
          await supabase
            .from('galleries')
            .update({
              cloud_cleanup_status: 'failed',
            })
            .eq('id', galleryId);
        } catch {
          // Ignore if column not yet present
        }

        results.push({
          galleryId,
          name: gallery.name,
          deletedCount: 0,
          status: `failed: ${err.message}`,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        cleanedCount: results.filter((r) => r.status === 'cleaned_successfully').length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Server error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
