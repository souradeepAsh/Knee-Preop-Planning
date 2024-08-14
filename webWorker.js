// webWorker.js
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

self.onmessage = function(event) {
  const loader = new STLLoader();
  loader.load(event.data.url, function (geometry) {
    postMessage({ geometry });
  });
};
