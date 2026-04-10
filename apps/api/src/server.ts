import { app } from "./app";
import { env } from "./config";

app.listen(env.port, () => {
  console.log(`API da agenda rodando na porta ${env.port}`);
});
