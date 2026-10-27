/** The desktop app lists and opens audio devices natively (`native/audioInput.ts`), so the
    webview's own media-device API is switched off. On Linux, WebKitGTK answers even a
    "devicechange" listener (the Tuner and the trainers add one) by asking the desktop's camera
    portal, which pops up an "Allow apps to use the camera?" dialog. */
export function installMediaDevices() {
  const devices = navigator.mediaDevices as (MediaDevices & EventTarget) | undefined;
  if (!devices) return;
  const add = EventTarget.prototype.addEventListener.bind(devices);
  const remove = EventTarget.prototype.removeEventListener.bind(devices);
  type Args = Parameters<EventTarget["addEventListener"]>;
  devices.addEventListener = (...[type, listener, options]: Args) => {
    if (type !== "devicechange") add(type, listener, options);
  };
  devices.removeEventListener = (...[type, listener, options]: Args) => {
    if (type !== "devicechange") remove(type, listener, options);
  };
  devices.enumerateDevices = async () => [];
}
