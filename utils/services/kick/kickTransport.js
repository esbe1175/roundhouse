import axios from "axios";

// Renderer imports use ordinary unauthenticated HTTP for public badge data.
// Main-process Kick calls install an adapter backed by the account's Electron session.
const transport = axios.create();
export function installKickAdapter(adapter) {
  transport.defaults.adapter = adapter;
}
export default transport;
