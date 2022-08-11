const { Client, MessageEmbed } = require("discord.js");
const client = new Client();
const express = require("express");
const dotenv = require("dotenv")
dotenv.config()
const app = express();
const conf = require("./src/configs/config.json");
const settings = require("./src/configs/settings.json");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const ejs = require("ejs");
const path = require("path");
const passport = require("passport");
const { Strategy } = require("passport-discord");
const session = require("express-session");
const mongoose = require("mongoose");
const url = require("url");
const moment = require("moment");
moment.locale("en");
const cooldown = new Map();

// </> Middlewares </>
app.engine(".ejs", ejs.__express);
app.set("view engine", "ejs");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ limit: "50mb", extended: false, }));
app.use(cookieParser());
app.set("views", path.join(__dirname, "src/views"));
app.use(express.static(__dirname + "/src/public"));
app.use(session({ secret: "secret-session-thing", resave: false, saveUninitialized: false, }));
app.use(passport.initialize());
app.use(passport.session());
// </> Middlewares </>

// </> Authorization </>
passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((obj, done) => done(null, obj));

const scopes = ["identify", "guilds"];
passport.use(new Strategy({
      clientID: settings.clientID,
      clientSecret: process.env.secret,
      callbackURL: settings.callbackURL,
      scope: scopes,
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    })
);

app.get("/login", passport.authenticate("discord", { scope: scopes, }));
app.get("/callback", passport.authenticate("discord", { failureRedirect: "/error", }), (req, res) => res.redirect("/"));
app.get("/logout", (req, res) => {
  req.logOut();
  return res.redirect("/");
});
// </> Authorization </>

// </> DB Connection </>
mongoose.connect(process.env.mongoURL, {
	useUnifiedTopology: true,
	useNewUrlParser: true,
	useFindAndModify: false,
});

mongoose.connection.on("connected", () => {
	console.log("Connected to DB");
});

mongoose.connection.on("error", () => {
	console.error("Connection Error!");
});
// </> DB Connection </>

// </> Pages </>
app.get("/", async (req, res) => {
  const guild = client.guilds.cache.get(conf.guildID);
  const owners = guild.members.cache.filter(x => x.roles.cache.has(conf.ownerRole));
  const admins = guild.members.cache.filter(x => x.roles.cache.has(conf.adminRole) && !owners.find(b => x.user.id == b));
  const moderators = guild.members.cache.filter(x => x.roles.cache.has(conf.modRole) && !admins.find(b => x.user.id == b) && !owners.find(b => x.user.id == b));
  const allBots = guild.members.cache.filter(x => x.roles.cache.has(conf.discordBotRoles) && !admins.find(b => x.user.id == b) && !owners.find(b => x.user.id == b));
  const trialstaff = guild.members.cache.filter(x => x.roles.cache.has(conf.trialStaffRole) && !moderators.find(b => x.user.id == b) && !admins.find(b => x.user.id == b) && !owners.find(b => x.user.id == b));
  const bots = guild.members.cache.filter(x => x.roles.cache.has(conf.discordBotRole) && !owners.find(b => x.user.id == b) && !admins.find(b => x.user.id == b));
  res.render("index", {
    user: req.user,
    icon: guild.iconURL({ dynamic: true }),
    owners,
    admins,
    bots,
    moderators,
    trialstaff,
    allBots,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/discord", (req, res) => 
  res.redirect(`https://discord.gg/${conf.guildInvite}`)
);

app.get("/invite", (req, res) => 
  res.redirect(`https://discord.gg/${conf.guildInvite}`)
);

app.get("/information", (req, res) =>
  res.render("info", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  })
);

app.get("/profile/:userID", async (req, res) => {
  const userID = req.params.userID;
  const guild = client.guilds.cache.get(conf.guildID);
  const member = guild.members.cache.get(userID);
  const userbanner = await client.api.users(userID).get();
  const banner = userbanner.banner ? `https://cdn.discordapp.com/banners/${userID}/${userbanner.banner}.png?size=4096` : "https://i.pinimg.com/originals/38/0f/d6/380fd60b504ed13cc115c29d14173277.jpg";
  if (!member) return error(res, 501, "There is no such user!");
  const userData = require("./src/schemas/user");
  const codeData = require("./src/schemas/code");
  let data = await userData.findOne({ userID });
  const code = await codeData.find({});
  let auth;
  if (member.roles.cache.has(conf.ownerRole)) auth = "Owner";
  else if (member.roles.cache.has(conf.adminRole)) auth = "Admin";
  else if (member.roles.cache.has(conf.discordBotRole)) auth = "Top Bots";
  else if (member.roles.cache.has(conf.booster)) auth = "Booster";
  else if (member.roles.cache.has(conf.modRole)) auth = "Moderator";
  else if (member.roles.cache.has(conf.trialStaffRole)) auth = "Trial Staff";
  else if (member.roles.cache.has(conf.discordBotRoles)) auth = "Bots";
  else auth = "Member";
  res.render("profile", {
    user: req.user,
    member,
    banner,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    auth,
    color: member.displayHexColor,
    data: data ? data : {},
    code,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/admin", async (req, res) => {
  if (!req.user) return error(res, 138, "You must be logged in to enter this page!");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = guild.members.cache.get(req.user.id);
  if (!member) return error(res, 138, "You must participate in our presentation to enter this page!");
  if (!member.hasPermission(8)) return error(res, 401, "You are not authorized to enter this page!");
  const codeData = require("./src/schemas/code");
  const code = await codeData.find({}).sort({ date: -1 });
  res.render("admin", {
    user: req.user,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    code
  });
});

app.get("/bug/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "To enter this page, you need to join our Discord server and log in to the site.");
  res.render("bug", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null,
    codeID: req.params.codeID
  });
});

app.get("/bug", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "To enter this page, you need to join our Discord server and log in to the site.");
  res.render("bug", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null,
  });
});

app.post("/bug", async (req, res) => {
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  if (!req.user || !member) return error(res, 138, "To enter this page, you need to join our Discord server and log in to the site.");
  const codeData = require("./src/schemas/code");
  console.log(req.body)
  const code = await codeData.findOne({ id: req.body.id });
  if (!code) return error(res, 404, req.body.id+" No code with ID found!");
  
  if (!code.bug) {
    code.bug = req.body.bug;
    code.save();
  } else return error(res, 208, "A bug has already been reported in this code!")
  
  const channel = client.channels.cache.get(conf.bugLog);
  const embed = new MessageEmbed()
  .setAuthor(req.user.username, member.user.avatarURL({ dynamic: true }))
  .setThumbnail(guild.iconURL({ dynamic: true }))
  .setTitle("A bug has been reported!")
  .setDescription(`
• Code name: [${code.name}](https://${conf.domain}/${code.rank}/${req.body.id})
• Reporter: ${guild.members.cache.get(req.user.id).toString()}
• Bug: ${req.body.bug}
  `)
  .setColor("RED")
  channel.send(embed);
  res.redirect(`/${code.rank}/${req.body.id}`);
});

app.get("/share", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to share the code, you need to join our Discord server and log in to the site.");
  res.render("shareCode", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    isStaff: client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id).roles.cache.has(conf.codeSharer),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.post("/sharing", async (req, res) => {
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  if (!req.user || !member) return error(res, 138, "In order to share the code, you need to join our Discord server and log in to the site.");
  const codeData = require("./src/schemas/code");
  const userData = require("./src/schemas/user");
  if (member && conf.notCodeSharer.some((x) => member.roles.cache.has(x) || member.user.id === x)) return error(res, 502, "You don't have permission to share code!");
  if (cooldown.get(req.user.id) && cooldown.get(req.user.id).count >= 3) return error(res, 429, "You can share up to 3 codes in 10 minutes!");
  const id = randomStr(8);
  
  let code = req.body;
  code.id = id;
  code.date = Date.now();
  if (!code.sharers) code.sharers = req.user.id;
  code.sharers = code.sharers.trim().split(" ").filter(x => guild.members.cache.get(x));
  if (code.sharers && !code.sharers.includes(req.user.id)) code.sharers.unshift(req.user.id);
  if (!code.modules) code.modules = "discord.js";
  if (!code.mainCode || code.mainCode && (code.mainCode.trim().toLowerCase() === "none" || code.mainCode.trim() === "-")) code.mainCode = "";
  if (!code.command || code.command && (code.command.trim().toLowerCase() === "none" || code.command.trim() === "-")) code.command = "";
  cooldown.get(req.user.id) ? cooldown.set(req.user.id, { count: cooldown.get(req.user.id).count += 1 }) : cooldown.set(req.user.id, { count: 1 });
  if (await cooldown.get(req.user.id).count === 1) setTimeout(() => cooldown.delete(req.user.id), 1000*60*10);
  
  code.sharers.map(async x => {
    const data = await userData.findOne({ userID: x });
    if (!data) {
      new userData({
        userID: x,
        codes: [code]
      }).save();
    } else {
      data.codes.push(code);
      data.save();
    }
  });
  
  let newCodeData = new codeData({
    name: code.name,
    id: code.id,
    sharers: code.sharers,
    desc: code.desc.trim(),
    modules: code.modules.trim(),
    mainCode: code.mainCode.trim(),
    command: code.command.trim(),
    rank: code.rank,
    date: code.date
  }).save();
  
  const channel = guild.channels.cache.get(conf.codeLog);
  let color;
  if (code.rank === "normal") color = "#bfe1ff";
  else if (code.rank === "gold") color = "#F1C531";
  else if (code.rank === "diamond") color = "#3998DB";
  else if (code.rank === "ready") color = "#f80000";
  else if (code.rank === "fromyou") color = ""
  const embed = new MessageEmbed()
  .setAuthor(req.user.username, member.user.avatarURL({ dynamic: true }))
  .setThumbnail(guild.iconURL({ dynamic: true }))
  .setTitle(`${code.rank} Code has been shared in the category!`)
  .setDescription(`
  • Code name: [${code.name}](https://${conf.domain}/${code.rank}/${id})
  • Code Description: ${code.desc}
  • Sharing the code: ${member.toString()}
  `)
  .setColor(color)
  channel.send(embed);
  res.redirect(`/${code.rank}/${id}`);
});

app.get("/normal", async (req, res) => {
  const codeData = require("./src/schemas/code");
  const data = await codeData.find({ rank: "normal" }).sort({ date: -1 });
  res.render("normalCodes", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data,
    moment,
    guild: client.guilds.cache.get(conf.guildID),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/gold", async (req, res) => {
  const codeData = require("./src/schemas/code");
  const data = await codeData.find({ rank: "gold" }).sort({ date: -1 });
  res.render("goldCodes", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data,
    moment,
    guild: client.guilds.cache.get(conf.guildID),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/diamond", async (req, res) => {
  const codeData = require("./src/schemas/code");
  const data = await codeData.find({ rank: "diamond" }).sort({ date: -1 });
  res.render("diamondCodes", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data,
    moment,
    guild: client.guilds.cache.get(conf.guildID),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/ready", async (req, res) => {
  const codeData = require("./src/schemas/code");
  const data = await codeData.find({ rank: "ready" }).sort({ date: -1 });
  res.render("readySystems", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data,
    moment,
    guild: client.guilds.cache.get(conf.guildID),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/fromyou", async (req, res) => {
  const codeData = require("./src/schemas/code");
  const data = await codeData.find({ rank: "fromyou" }).sort({ date: -1 });
  res.render("fromyou", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data,
    moment,
    guild: client.guilds.cache.get(conf.guildID),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/normal/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to see the codes, you need to join our Discord server and log in to the site.");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  if (member && !member.roles.cache.has(conf.booster) && !member.roles.cache.has(conf.ownerRole) && !member.roles.cache.has(conf.adminRole)) return error(res, 501, "You do not have the required roles to view this code! Please read the information page!");
  const codeID = req.params.codeID;
  if (!codeID) return res.redirect("/");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: "normal", id: codeID });
  if (!code) return error(res, 404, codeID+" There is no code with ID!");
  res.render("code", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data: code,
    guild,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/gold/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to see the codes, you need to join our Discord server and log in to the site.");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  const codeID = req.params.codeID;
  if (!codeID) return res.redirect("/");
  if (member && !member.roles.cache.has(conf.goldRole) && !member.roles.cache.has(conf.booster) && !member.roles.cache.has(conf.ownerRole) && !member.roles.cache.has(conf.adminRole)) return error(res, 501, "You do not have the required roles to view this code! Please read the information page!");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: "gold", id: codeID });
  if (!code) return error(res, 404, codeID+" There is no code with ID!");
  res.render("code", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data: code,
    guild,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/diamond/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to see the codes, you need to join our Discord server and log in to the site.");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  const codeID = req.params.codeID;
  if (!codeID) return res.redirect("/");
  if (member && !member.roles.cache.has(conf.diaRole) && !member.roles.cache.has(conf.booster) && !member.roles.cache.has(conf.ownerRole) && !member.roles.cache.has(conf.adminRole)) return error(res, 501, "You do not have the required roles to view this code! Please read the information page!");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: "diamond", id: codeID });
  if (!code) return error(res, 404, codeID+" There is no code with ID!");
  res.render("code", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data: code,
    guild,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/ready/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to see the codes, you need to join our Discord server and log in to the site.");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = guild.members.cache.get(req.user.id);
  const codeID = req.params.codeID;
  if (!codeID) return res.redirect("/");
  if (member && !member.roles.cache.has(conf.readySystemsRole) && !member.roles.cache.has(conf.booster) && !member.roles.cache.has(conf.ownerRole) && !member.roles.cache.has(conf.adminRole)) return error(res, 501, "You do not have the required roles to view this code! Please read the information page!");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: "ready", id: codeID });
  if (!code) return error(res, 404, codeID+" There is no code with ID!");
  res.render("code", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data: code,
    guild,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/fromyou/:codeID", async (req, res) => {
  if (!req.user || !client.guilds.cache.get(conf.guildID).members.cache.has(req.user.id)) return error(res, 138, "In order to see the codes, you need to join our Discord server and log in to the site.");
  const guild = client.guilds.cache.get(conf.guildID);
  const codeID = req.params.codeID;
  if (!codeID) return res.redirect("/");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: "fromyou", id: codeID });
  if (!code) return error(res, 404, codeID+" There is no code with ID!");
  res.render("code", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    data: code,
    guild,
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.get("/delete/:rank/:id", async (req, res) => {
  if (!req.user) return error(res, 138, "You must be logged in to enter this page!");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = guild.members.cache.get(req.user.id);
  if (!member) return error(res, 138, "You must participate in our presentation to enter this page!");
  const codeData = require("./src/schemas/code");
  const userData = require("./src/schemas/user");
  const code = await codeData.findOne({ rank: req.params.rank, id: req.params.id });
  if (!code) return error(res, 404, req.params.id+" There is no code with ID!");
  if (!member.hasPermission(8) || !code.sharers.includes(req.user.id)) return error(res, 401, "You are not authorized to enter this page!");
  
  
  const channel = client.channels.cache.get(conf.codeLog);
  const embed = new MessageEmbed()
  .setAuthor(req.user.username, member.user.avatarURL({ dynamic: true }))
  .setThumbnail(guild.iconURL({ dynamic: true }))
  .setTitle(`${code.rank} A code has been deleted in the category!`)
  .setDescription(`
• Code name: ${code.name}
• Code Description: ${code.desc}
• Sharing the code: ${guild.members.cache.get(code.sharers[0]) ? guild.members.cache.get(code.sharers[0]).toString() : client.users.fetch(code.sharers[0]).then(x => x.username)}
• Deleting the code: ${member.toString()}
  `)
  .setColor("RED")
  channel.send(embed);
  
  const data = await userData.findOne({ userID: req.user.id });
  if (data) {
    data.codes = data.codes.filter(x => x.id !== req.params.id);
    data.save();
  }
  
  code.deleteOne();
  res.redirect("/");
});

app.get("/edit/:rank/:id", async (req, res) => {
  if (!req.user) return error(res, 138, "You must be logged in to enter this page!");
  const guild = client.guilds.cache.get(conf.guildID);
  const member = guild.members.cache.get(req.user.id);
  if (!member) return error(res, 138, "You must participate in our presentation to enter this page!");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ rank: req.params.rank, id: req.params.id });
  if (!code) return error(res, 404, req.params.id+" There is no code with ID!");
  if (!member.hasPermission(8) || !code.sharers.includes(req.user.id)) return error(res, 401, "You are not authorized to enter this page!");
  res.render("editCode", {
    user: req.user,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    isStaff: client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id).roles.cache.has("1006572057024274472"),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null,
    rank: req.params.rank,
    id: req.params.id
  });
});

app.post("/edit", async (req, res) => {
  const guild = client.guilds.cache.get(conf.guildID);
  const member = req.user ? guild.members.cache.get(req.user.id) : null;
  if (!req.user || !member) return error(res, 138, "In order to share the code, you need to join our Discord server and log in to the site.");
  const codeData = require("./src/schemas/code");
  const code = await codeData.findOne({ id: req.body.id });
  console.log(code)
  if (!code) return error(res, 404, req.body.id+" There is no code with ID!")
  
  let body = req.body;
  if (!body.name) body.name = code.name;
  if (!body.sharers) body.sharers = code.sharers;
  if (!body.desc) body.desc = code.desc;
  if (!body.modules) body.modules = code.modules;
  if (!body.mainCode) body.mainCode = code.mainCode;
  if (!body.command) body.command = code.command;
  if (!body.rank) body.rank = code.rank;
  
  code.name = body.name;
  code.sharers = body.sharers;
  code.desc = body.desc
  code.modules = body.modules
  code.mainCode = body.mainCode
  code.command = body.command
  code.rank = body.rank
  code.bug = null;
  code.save();
 
  const channel = client.channels.cache.get(conf.codeLog);
  const embed = new MessageEmbed()
  .setAuthor(req.user.username, member.user.avatarURL({ dynamic: true }))
  .setThumbnail(guild.iconURL({ dynamic: true }))
  .setTitle("Created a code!")
  .setDescription(`
  • Codename: [${body.name}](https://${conf.domain}/${body.rank}/${body.id})
  • Code Description: ${body.desc}
  • Code shared by ${member.toString()}
  `)
  .setColor("YELLOW");
  channel.send(embed);
  res.redirect(`/${body.rank}/${body.id}`);
});

app.post("/like", async (req, res) => {
  if (!req.user) return;
  const codeData = require("./src/schemas/code");
  const userData = require("./src/schemas/user");
  const code = await codeData.findOne({ id: req.body.id });
  if (code.sharers.includes(req.user.id)) return;
  if (code.likedUsers && code.likedUsers.includes(req.user.id)) return;
  if (req.body.durum === "true") {
  if (!code.likedUsers) {
    code.likedUsers = [req.user.id]
    code.save();
  } else {
    code.likedUsers.push(req.user.id)
    code.save();
  }
  code.sharers.map(async x => {
    const sharerData = await userData.findOne({ userID: x });
    sharerData.getLikeCount += 1;
    sharerData.save();
  });
  } else {
    if (code.likedUsers && !code.likedUsers.includes(req.user.id)) return;
    code.likedUsers = code.likedUsers.filter(x => x !== req.user.id);
    code.save();
    code.sharers.map(async x => {
      const sharerData = await userData.findOne({ userID: x });
      sharerData.getLikeCount -= 1;
      sharerData.save();
    });
  }
});

app.get("/error", (req, res) => {
  res.render("error", {
    user: req.user,
    statuscode: req.query.statuscode,
    message: req.query.message,
    icon: client.guilds.cache.get(conf.guildID).iconURL({ dynamic: true }),
    reqMember: req.user ? client.guilds.cache.get(conf.guildID).members.cache.get(req.user.id) : null
  });
});

app.use((req, res) => error(res, 404, "Page not found!"));
// </> Pages </>


// </> Functions </>
const error = (res, statuscode, message) => {
  return res.redirect(url.format({ pathname: "/error", query: { statuscode, message }}));
};

const randomStr = (length) => {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
// </> Functions </>

app.listen(process.env.PORT || 5000);
client.login(process.env.token).catch((err) => console.log(err));

client.on("ready", () => {
  console.log("Site Ready!");
});
