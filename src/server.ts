import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 8080;

createApp().listen(port, (error) => {
  if (error) throw error;
  console.log(`[server]: listening on http://localhost:${port}`);
});
