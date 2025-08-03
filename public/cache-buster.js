// Emergency cache buster - clears ALL caches and forces hard reload
(function() {
  console.log('Emergency cache buster activated');
  
  // Clear all service worker caches
  if ('caches' in window) {
    caches.keys().then(function(names) {
      for (let name of names) {
        console.log('Deleting cache:', name);
        caches.delete(name);
      }
    });
  }
  
  // Unregister all service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        console.log('Unregistering service worker');
        registration.unregister();
      }
    });
  }
  
  // Clear localStorage and sessionStorage
  try {
    localStorage.clear();
    sessionStorage.clear();
    console.log('Storage cleared');
  } catch(e) {
    console.log('Could not clear storage:', e);
  }
  
  // Force hard reload after a short delay
  setTimeout(() => {
    console.log('Forcing hard reload...');
    window.location.reload(true);
  }, 1000);
})();
