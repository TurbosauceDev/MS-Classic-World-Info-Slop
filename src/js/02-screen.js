/* Screen share for the live readers (EXP/hr 63-expclive.js, Quest log 61-questlog.js): the game window shared with the
   page (getDisplayMedia, nothing leaves the browser), one frame every `ms` handed to onFrame({w, h, d: RGBA}).
   Frames come from ImageCapture (works while the game is in front) and ticks from a worker (a background tab's own
   timers slow to once a minute). shareScreen() resolves to {stop} or a message string (unsupported / cancelled). */
function screenTicker(ms, f){
  let iv = null, w = null;
  const plain = () => { if (!iv) iv = setInterval(f, ms) };
  try { w = new Worker(URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], {type: "text/javascript"}))); w.onmessage = f; w.onerror = () => { w.terminate(); w = null; plain() } }
  catch(e){ plain() }
  return () => { clearInterval(iv); w?.terminate() };
}
async function shareScreen({ms = 500, fps = 5, onFrame, onEnd = () => {}, before = async () => {}}){
  if (!navigator.mediaDevices?.getDisplayMedia) return "Needs a desktop browser (Chrome, Edge, Firefox, Safari).";
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({video: {frameRate: fps}, audio: false}) }
  catch(e){ return e.name === "NotAllowedError" ? "Sharing cancelled." : "This page can't share your screen here: open the site in your browser." }
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream;
  try { await video.play() } catch(e) {}
  const track = stream.getVideoTracks()[0], canvas = document.createElement("canvas"), cap = window.ImageCapture ? new ImageCapture(track) : null;
  let tick = null, busy = false, live = true;
  const stop = () => { if (!live) return; live = false; tick?.(); stream.getTracks().forEach(t => t.stop()) };
  track.addEventListener("ended", () => { if (live){ stop(); onEnd() } });
  await before();
  const grab = async () => {
    if (!live || busy) return; busy = true;
    try {
      let src = null;
      if (cap && track.readyState === "live") try { src = await cap.grabFrame() } catch(e) {}
      if (!src){ if (!video.videoWidth) return; src = video }
      const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
      if (canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h }
      const g = canvas.getContext("2d", {willReadFrequently: true}); g.drawImage(src, 0, 0); src.close?.();
      if (live) await onFrame({w, h, d: g.getImageData(0, 0, w, h).data});
    } catch(e) {} finally { busy = false }
  };
  if (live) tick = screenTicker(ms, grab);
  return {stop};
}
