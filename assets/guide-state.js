/* Keep the Home planning form separate from the last saved trip. */
(() => {
  'use strict';
  const navigate = go;
  go = function (page) {
    if (page === 'home' && S.page !== 'home' && S.tripCreated) {
      persistActiveTrip();
      S.tripCreated = false;
      S.activeTripId = null;
      S.view = 'timeline';
      S.proposal = null;
    }
    return navigate(page);
  };
})();
