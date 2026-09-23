const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const web = path.resolve(__dirname, "..");
const releasesDir = path.join(web, ".releases");
const metaFile = path.join(releasesDir, "releases.json");
const nodeModules = path.join(web, "node_modules");
const nextBin = path.join(nodeModules, "next", "dist", "bin", "next");

function readMeta() {
  if (!fs.existsSync(metaFile)) {
    console.error("No releases found. Run npm run build --prefix apps\\web first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  const versions = Array.isArray(data.versions) ? data.versions : [];

  if (!versions.length) {
    console.error("No releases found.");
    process.exit(1);
  }

  return {
    defaultVersion: String(data.defaultVersion || versions[0].version),
    versions,
  };
}

function parseCookies(raw) {
  const out = {};

  for (const part of String(raw || "").split(";")) {
    const i = part.indexOf("=");

    if (i < 0) continue;

    out[part.slice(0, i).trim()] =
      decodeURIComponent(part.slice(i + 1).trim());
  }

  return out;
}

function latestVersion(meta) {
  return meta.versions[meta.versions.length - 1].version;
}

function versionExists(meta, version) {
  return meta.versions.some((v) => v.version === version);
}

function selectedVersion(meta, req) {
  const cookies = parseCookies(req.headers.cookie);

  if (cookies.tm_release && versionExists(meta, cookies.tm_release)) {
    return cookies.tm_release;
  }

  return meta.defaultVersion;
}


const meta = readMeta();

const children = new Map();
const ports = new Map();


meta.versions.forEach((item, index) => {

  const port = 3101 + index;

  ports.set(item.version, port);


  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port)],
    {
      cwd: item.path,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: String(port),
      },
      stdio:["ignore","pipe","pipe"],
    }
  );


  child.stdout.on("data",(d)=>{
    process.stdout.write(
      "["+item.version.slice(-6)+"] "+d
    );
  });


  child.stderr.on("data",(d)=>{
    process.stderr.write(
      "["+item.version.slice(-6)+"] "+d
    );
  });


  children.set(item.version, child);

});



function json(res,status,data,headers={}){

  const body = JSON.stringify(data);

  res.writeHead(status,{
    "Content-Type":"application/json",
    "Cache-Control":"no-store",
    ...headers
  });

  res.end(body);

}



function proxy(req,res,version,setCookie){

  const port = ports.get(version);


  if(!port){
    json(res,503,{
      error:"Release not running"
    });
    return;
  }


  const upstream=http.request(
    {
      hostname:"127.0.0.1",
      port,
      path:req.url,
      method:req.method,
      headers:{
        ...req.headers,
        host:"127.0.0.1:"+port
      }
    },

    (upstreamRes)=>{

      const headers={
        ...upstreamRes.headers
      };


      if(setCookie){

        headers["set-cookie"] =
          "tm_release="+encodeURIComponent(version)+
          "; Path=/; SameSite=Lax; Max-Age=31536000";

      }


      res.writeHead(
        upstreamRes.statusCode || 200,
        headers
      );


      upstreamRes.pipe(res);

    }
  );


  upstream.on("error",(err)=>{

    json(res,502,{
      error:err.message
    });

  });


  req.pipe(upstream);

}




const gateway=http.createServer((req,res)=>{


  const currentMeta=readMeta();

  const selected=selectedVersion(currentMeta,req);

  const latest=latestVersion(currentMeta);



  // UPDATE CHECK API
  if(req.url === "/api/release"){

    json(res,200,{
      latestVersion: latest,
      selectedVersion:selected,
      updateAvailable:selected !== latest
    });

    return;

  }



  // INFO
  if(req.url.startsWith("/__release-info")){

    json(res,200,{

      selectedVersion:selected,

      latestVersion:latest,

      updateAvailable:selected !== latest

    });

    return;

  }




  // APPLY UPDATE

  if(req.url.startsWith("/__apply-update")){


    if(req.method !== "POST"){

      json(res,405,{
        error:"POST required"
      });

      return;

    }



    json(
      res,
      200,
      {
        ok:true,
        version:latest
      },
      {
        "Set-Cookie":
        "tm_release="+encodeURIComponent(latest)+
        "; Path=/; SameSite=Lax; Max-Age=31536000"
      }
    );


    return;

  }




  const cookies=parseCookies(req.headers.cookie);


  const validCookie =
    cookies.tm_release &&
    versionExists(currentMeta,cookies.tm_release);



  proxy(
    req,
    res,
    selected,
    !validCookie
  );

});





gateway.listen(3000,()=>{


 console.log("");

 console.log("========================================");

 console.log(" Task Manager Release Gateway");

 console.log("========================================");

 console.log(" URL: http://localhost:3000");

 console.log(" Default:",meta.defaultVersion);

 console.log(" Latest:",latestVersion(meta));

 console.log(" Releases:",meta.versions.length);

 console.log("========================================");


});





function shutdown(){

 for(const child of children.values()){

   try{
    child.kill();
   }catch{}

 }

 gateway.close(()=>process.exit(0));

}


process.on("SIGINT",shutdown);
process.on("SIGTERM",shutdown);
