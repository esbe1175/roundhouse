// FFmpeg's HLS demuxer normally starts three segments from the live edge.
// Start at the newest complete segment; MPV's profile also reduces local delay.
// These apply before loadfile, including quality changes and return-to-live.
export function latencyOptions(enabled) {
  return enabled
    ? [
        "--profile=low-latency",
        "--demuxer-lavf-o-add=live_start_index=-1",
        "--cache-secs=1",
        "--demuxer-readahead-secs=1",
      ]
    : [];
}
