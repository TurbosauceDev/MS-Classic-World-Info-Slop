// Last file of the app script: marks the page interactive. On the Pages copy the app runs only after the prices file
// has been fetched, so a test (or a very fast click) right after `load` can beat the handlers. tests/smoke.js waits for this.
document.documentElement.dataset.ready = "1";
