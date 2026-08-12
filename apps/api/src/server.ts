import app from "./app";
import { env } from "./config/env";

const startServer = (): void => {
  try {
    app.listen(env.PORT, () => {
      console.log("");
      console.log("========================================");
      console.log(" Task Management API");
      console.log("========================================");
      console.log(` Server:      http://localhost:${env.PORT}`);
      console.log(` Health:      http://localhost:${env.PORT}/api/health`);
      console.log(` Environment: ${env.NODE_ENV}`);
      console.log("========================================");
      console.log("");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();