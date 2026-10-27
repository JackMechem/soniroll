/** Desktop version of `lib/metronome`. For now `getAudioContext()` is the window's own Web Audio
    context (the website's), so tools that build their own sounds keep working; the click engine,
    reference tones and microphone input are native (see the other files here). */

export * from "@web/lib/metronome";
