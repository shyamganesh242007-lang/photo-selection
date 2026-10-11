import { useState, useEffect } from 'react';
import { CustomerGallery } from './components/CustomerGallery';
import { PhotographerWorkflow } from './components/PhotographerWorkflow';

export function App() {
  // Client Route State (/gallery/:galleryId)
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash.startsWith('#/gallery/')) {
        return window.location.hash.replace(/^#/, '');
      }
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.hash.startsWith('#/gallery/')) {
        setCurrentPath(window.location.hash.replace(/^#/, ''));
      } else {
        setCurrentPath(window.location.pathname);
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  // ROUTE DISPATCHER: Check if viewing /gallery/:galleryId
  const galleryMatch = currentPath.match(/^\/gallery\/([a-zA-Z0-9-]+)/);
  if (galleryMatch) {
    const routeGalleryId = galleryMatch[1];
    return (
      <CustomerGallery
        galleryId={routeGalleryId}
        onBack={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
        }}
      />
    );
  }

  // PRIMARY: Photographer Workflow (Home Screen: [ + ADD EVENT FOLDER ] + Recent Events)
  return <PhotographerWorkflow />;
}

export default App;
