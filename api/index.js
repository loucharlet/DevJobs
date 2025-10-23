import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import db from "./config/db.js"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())


app.use((req, res, next) => {

  const protectedPaths = [
    /^\/api\/users\/(ban|delete)/,
    /^\/api\/ads\/\d+$/,
    /^\/api\/companies\/(create|update|delete)/,
  ];

  const needsAuth = protectedPaths.some((re) => re.test(req.path)) || req.path.startsWith("/api/admin");
  if (!needsAuth) return next();

  const token = req.headers["x-admin"];
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.warn("ADMIN_PASSWORD not set in .env — denying admin access");
    return res.status(500).json({ ok: false, error: "admin_not_configured" });
  }
  if (token && token === expected) return next();
  return res.status(401).json({ ok: false, error: "unauthorized" });
});


const q = (sql, params=[]) => new Promise((ok, ko) => {
  db.query(sql, params, (e, r) => e ? ko(e) : ok(r))
})


app.get("/ping", (req, res) => res.json({ ok: true, t: Date.now() }));

app.get("/api/ads",(req,res)=>{
  const q=(req.query.q||"");
  const lieu=(req.query.lieu||"");
  const like=s=>`%${s}%`;
  const sql=`
    SELECT 
      a.ad_id,
      a.title,
      a.short_desc,
      a.long_desc,
      a.localisation,
      a.contract_type,
      c.company_id,                   
      COALESCE(c.nom,'') AS company_name
    FROM advertisement a
    LEFT JOIN company c ON c.company_id=a.company
    WHERE (a.title LIKE ? OR a.short_desc LIKE ? OR a.long_desc LIKE ? OR COALESCE(c.nom,'') LIKE ?)
      AND COALESCE(a.localisation,'') LIKE ?
    ORDER BY a.ad_id DESC
    LIMIT 100
  `;
  const p=[like(q),like(q),like(q),like(q),like(lieu)];
  db.query(sql,p,(err,rows)=>{
    if(err){ return res.status(500).json({ok:false,error:"DB_ERROR"}); }
    const data=(rows||[]).map(x=>({
      id: x.ad_id,
      poste: x.title,
    
      company_id: x.company_id,           
      company_name: x.company_name || "—",


      entreprise: x.company_name || "—",
      lieu: x.localisation || "—",
      type_contrat: x.contract_type || "—",
      courte: x.short_desc || "",
      longue: x.long_desc || "",
      tags: []
    }));
    res.json({ok:true,data});
  });
});


app.get("/api/ads/:id",(req,res)=>{
  const sql=`
    SELECT a.*,COALESCE(c.nom,'') AS company_name
    FROM advertisement a
    LEFT JOIN company c ON c.company_id=a.company
    WHERE a.ad_id=?
  `;
  db.query(sql,[req.params.id],(err,rows)=>{
    if(err){ return res.status(500).json({ok:false,error:"DB_ERROR"}); }
    if(!rows.length){ return res.status(404).json({ok:false,error:"NOT_FOUND"}); }
    const x=rows[0];
    const data={
      id:x.ad_id,
      poste:x.title,
      entreprise:x.company_name||"—",
      lieu:x.localisation||"—",
      type_contrat:x.contract_type||"—",
      courte:x.short_desc||"",
      longue:x.long_desc||"",
      tags:[]
    };
    res.json({ok:true,data});
  });
});

app.get("/api/applications", async (req,res)=>{
  const recruiter = (req.query.recruiter || "").trim();
  if (!recruiter) return res.status(400).json({ ok:false, error:"missing_recruiter" });

  const sql = `
    SELECT 
      a.application_id,
      u.user_id,
      u.firstname,
      u.lastname,
      u.email
    FROM application a
    JOIN user u ON u.user_id = a.applier
    WHERE a.recruiter = ?
    ORDER BY a.application_id DESC
  `;
  try {
    const rows = await q(sql, [recruiter]);
    res.json({ ok:true, data: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});


app.post("/api/applications", async (req, res) => {
  try {
    const { recruiter, applier } = req.body || {};
    if (!recruiter || !applier?.email) {
      return res.status(400).json({ ok:false, error:"missing_fields" });
    }
    const u = await q("SELECT user_id FROM user WHERE email = ?", [applier.email]);
    let userId = u[0]?.user_id;
    if (!userId) {
      const ins = await q(
        "INSERT INTO user (firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [applier.firstname||"", applier.lastname||"", applier.email, "", "", 0, "", "", 0, ""]
      );
      userId = ins.insertId;
    }
    await q("INSERT INTO application (applier, recruiter, email) VALUES (?,?,?)",
      [userId, recruiter, applier.email]
    );
    res.status(201).json({ ok:true });
  } catch (e) {
    console.error("POST /api/applications ERROR:", e);
    res.status(500).json({ ok:false, error:e.message });
  }
});
app.get("/__whoami", (req,res)=> res.json({ file: __filename, cwd: process.cwd(), ts: Date.now() }))

app.post("/api/register", async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.email || !b.password) return res.status(400).json({ ok:false, error:"missing_fields" })
    const ex = await q("SELECT user_id FROM user WHERE email = ? LIMIT 1", [b.email])
    if (ex.length) return res.status(409).json({ ok:false, error:"email_exists" })

    const zipcodeNum = Number.parseInt(b.zipcode, 10)
    const zipcode = Number.isFinite(zipcodeNum) ? zipcodeNum : 0

    const ins = await q(
      "INSERT INTO user (firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [b.firstname||"", b.lastname||"", b.email, b.phone||"", b.adress||"", zipcode, b.country||"", b.password, 1, b.Ville||""]
    )
    const row = await q("SELECT user_id, firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville FROM user WHERE user_id = ? LIMIT 1", [ins.insertId])
    res.json({ ok:true, user: row[0] })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})


app.post("/api/login", async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.email || !b.password) return res.status(400).json({ ok:false, error:"missing_fields" })
    const r = await q("SELECT user_id, firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville FROM user WHERE email = ? AND password = ? LIMIT 1", [b.email, b.password])
    if (!r.length) return res.status(401).json({ ok:false, error:"invalid_credentials" })
    res.json({ ok:true, user: r[0] })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})

app.get("/api/me", async (req, res) => {
  try {
    const id = (req.query.user_id||"").trim()
    if (!id) return res.status(400).json({ ok:false, error:"missing_user_id" })
    const r = await q("SELECT user_id, firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville FROM user WHERE user_id = ? LIMIT 1", [id])
    if (!r.length) return res.status(404).json({ ok:false, error:"not_found" })
    res.json({ ok:true, user: r[0] })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})

app.put("/api/me", async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.user_id) return res.status(400).json({ ok:false, error:"missing_user_id" })

    const zipcodeNum = Number.parseInt(b.zipcode, 10)
    const zipcode = Number.isFinite(zipcodeNum) ? zipcodeNum : 0

    await q(
      "UPDATE user SET firstname=?, lastname=?, email=?, phone=?, adress=?, zipcode=?, country=?, password=?, Ville=? WHERE user_id=?",
      [b.firstname||"", b.lastname||"", b.email||"", b.phone||"", b.adress||"", zipcode, b.country||"", b.password||"", b.Ville||"", b.user_id]
    )
    const r = await q("SELECT user_id, firstname, lastname, email, phone, adress, zipcode, country, password, active, Ville FROM user WHERE user_id = ? LIMIT 1", [b.user_id])
    res.json({ ok:true, user: r[0] })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})


app.delete("/api/me", async (req, res) => {
  try {
    const b = req.body || {}
    if (!b.user_id) return res.status(400).json({ ok:false, error:"missing_user_id" })
    await q("DELETE FROM user WHERE user_id = ? LIMIT 1", [b.user_id])
    res.json({ ok:true })
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message })
  }
})








//helpers pour debug mon truc
function show500(res, where, err) {
  console.error(`[API ERROR] ${where}:`, err?.sqlMessage || err?.message || err);
  res.status(500).json({ ok:false, where, error: err?.sqlMessage || err?.message || "server_error" });
}


function tableExists(db, table, cb) {
  db.query("SHOW TABLES LIKE ?", [table], (err, rows) => {
    if (err) return cb(err, false);
    cb(null, rows && rows.length > 0);
  });
}

function columnExists(db, table, column, cb) {
  db.query("SHOW COLUMNS FROM ?? LIKE ?", [table, column], (err, rows) => {
    if (err) return cb(err, false);
    cb(null, rows && rows.length > 0);
  });
}



app.get("/api/companies", (req, res) => {
  const sql = "SELECT company_id, nom, domaine, email FROM company ORDER BY company_id DESC";
  db.query(sql, [], (err, rows) => {
    if (err) return show500(res, "GET /api/companies", err);
    res.json({ ok:true, data: rows });
  });
});

app.get("/api/ads", (req, res) => {

  tableExists(db, "advertisement", (err, advExists) => {
    if (err) return show500(res, "GET /api/ads(tableExists:advertisement)", err);
    const tableName = advExists ? "advertisement" : "adverdissement";

    const sql = `
      SELECT a.ad_id, a.title, a.short_desc, a.long_desc, a.localisation, a.contract_type,
             a.company, COALESCE(c.nom,'') AS company_name
      FROM \`${tableName}\` a
      LEFT JOIN company c ON c.company_id = a.company
      ORDER BY a.ad_id DESC
    `;
    db.query(sql, [], (err2, rows) => {
      if (err2) return show500(res, `GET /api/ads(select:${tableName})`, err2);
      res.json({ ok:true, data: rows });
    });
  });
});

app.get("/api/users", (req, res) => {

  const baseCols = ["user_id", "firstname", "lastname", "email"];
  const optionalCols = ["role", "active"];

  function buildAndRun(cols) {
    const sel = cols.map(c => `\`${c}\``).join(", ");
    const sql = `SELECT ${sel} FROM \`user\` ORDER BY \`user_id\` DESC`;
    db.query(sql, [], (err, rows) => {
      if (err) return show500(res, "GET /api/users(select)", err);
      res.json({ ok:true, data: rows });
    });
  }


  columnExists(db, "user", "role", (e1, hasRole) => {
    if (e1) return show500(res, "GET /api/users(check role)", e1);
    columnExists(db, "user", "active", (e2, hasActive) => {
      if (e2) return show500(res, "GET /api/users(check active)", e2);
      const cols = [...baseCols, ...(hasRole ? ["role"] : []), ...(hasActive ? ["active"] : [])];
      buildAndRun(cols);
    });
  });
});


app.delete("/api/ads/:id", (req, res) => {
  db.query("DELETE FROM advertisement WHERE ad_id = ? LIMIT 1", [req.params.id], (err) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true });
  });
});

app.post("/api/users/ban", (req, res) => {
  const { user_id, banned } = req.body || {};
  if (!user_id) return res.status(400).json({ ok:false, error:"missing_user_id" });
  db.query("UPDATE user SET active = ? WHERE user_id = ? LIMIT 1", [banned ? 0 : 1, user_id], (err) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true });
  });
});

app.post("/api/users/delete", (req, res) => {
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ ok:false, error:"missing_user_id" });
  db.query("DELETE FROM user WHERE user_id = ? LIMIT 1", [user_id], (err) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true });
  });
});







app.get("/api/companies", (req, res) => {
  const sql = "SELECT company_id, nom, domaine, email FROM company ORDER BY company_id DESC";
  db.query(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ ok:false, error: err.message });
    res.json({ ok:true, data: rows });
  });
});

app.get("/api/ads", (req, res) => {
  const trySql = (table) => `
    SELECT a.ad_id, a.title, a.short_desc, a.long_desc, a.localisation, a.contract_type,
           a.company, COALESCE(c.nom,'') AS company_name
    FROM \`${table}\` a
    LEFT JOIN company c ON c.company_id = a.company
    ORDER BY a.ad_id DESC
  `;
  db.query(trySql("advertisement"), [], (e1, rows) => {
    if (!e1) return res.json({ ok:true, data: rows });

    db.query(trySql("adverdissement"), [], (e2, rows2) => {
      if (e2) return res.status(500).json({ ok:false, error: e2.message });
      res.json({ ok:true, data: rows2 });
    });
  });
});




const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("serveur online", PORT));
