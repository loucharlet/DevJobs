import mysql from "mysql2";
import dotenv from "dotenv";
dotenv.config();

const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "devjobs",
  socketPath: process.env.DB_SOCKET_PATH || undefined,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  multipleStatements: false
});

db.connect(err => {
  if (err) {
    console.error("Erreur de connexion DB:", err.message);
  } else {
    console.log("Connexion DB OK");
  }
});

export default db;
