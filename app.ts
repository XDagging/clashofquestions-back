require('dotenv').config()
// npm i express https cors fs body-parser express-session uuid memorystore @aws-sdk/lib-dynamodb @aws-sdk/client-dynamodb md5 cryptr

const {authenticateUser, isEmail, isPassword, isString, isNumber, reportError, craftRequest, setCookie, sendEmail, generateCode} = require('./functions.js');

import express, {Router} from "express";
// const express = require("express");
// const https = require("https");
import https from "https";
import startWebsocket from "./connections";
import cors from "cors"
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { v4 } from "uuid";
import type { Question } from "./types.js";
import type {GameState} from "./connections.ts"

import fs from "fs"
import { Request, Response } from 'express';
// const md5 = require('md5');
import md5 from "md5"
import http from "http";
import bodyParser from "body-parser"
// const bodyParser = require("body-parser")
const app = express();
app.set('trust proxy', 1);
const region: string = "us-east-1"
// const session = require("express-session");
// @ts-ignore
import session from "express-session"

import {locateEntry, addEntry, updateEntry, queryEntries} from "./databaseFunctions.ts"
// ...existing code...
// Use require for memorystore if import fails

const MemoryStore = require("memorystore")(session);
// ...existing code...

// const bcrypt = require("bcrypt");
import bcrypt from "bcrypt"

// const Cryptr = require('cryptr');
import Cryptr from "cryptr"

const saltRounds = 10;
import type { Options, RegisterBody, User, LoginBody, CodeBody, LocateEntryEntry, BrowserUser } from "./types.js";
if (!process.env.ENCRYPTION_KEY) {
    throw new Error("Encryption key isn't set. Add it now.");
}
export const cmod = new Cryptr(process.env.ENCRYPTION_KEY);

// Things to do

const SCHEMA = ['name','email','password', ]

// Basic web server configurations
let options: Options;
export const sessionMiddleware = session({
    secret: process.env.COOKIE_SECRET as string,
    cookie: {
        path: "/",
        maxAge: 2628000000,
        httpOnly: true,     
        sameSite: "none",
        secure: true,
        domain: process.env.NODE_ENV === "DEV" ? undefined : ".clashofquestions.com",
    },
    resave: false,
    saveUninitialized: true,
    store: new MemoryStore({
        checkPeriod: 86400000 
    }) as any, 
    proxy: true
})
app.use(sessionMiddleware)

app.use(passport.initialize());
app.use(passport.session());
// import {CronJob} from "cron"
// const { CronJob } = require('cron');



// console.log("Testing midnight functions")
// midnightFunctions();





if (process.env.NODE_ENV === "DEV") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // development certificate
    options = {
        key: fs.readFileSync('C:\\Users\\marac\\code\\hackathon-quhacks\\key.pem'),
        cert: fs.readFileSync('C:\\Users\\marac\\code\\hackathon-quhacks\\cert.pem'),
        // Remove this line once done with production
        rejectUnauthorized: false
    };    
    // Local host
    app.use(cors({
        origin: "http://localhost:5173",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        credentials: true
    }));
    
} else {

    // STEP 1: This will be where the certificates are stored.

    // options = {
    //     key: fs.readFileSync("/etc/letsencrypt/live/api.toomanyheys.com/privkey.pem"),
    //     cert: fs.readFileSync('/etc/letsencrypt/live/api.toomanyheys.com/fullchain.pem'),
    //     // Remove this line once done with production
    //     rejectUnauthorized: false
    // };    

    app.use(cors({
        origin: "https://clashofquestions.com",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        credentials: true
    }));
    // prod credentials


}



passport.serializeUser((user: any, done: any) => {
    console.log("this is serial", user)
    done(null, user); // Save UUID in session
});

passport.deserializeUser(async (user: any, done: any) => {
    console.log("DESERIALIZE FUNCTION CALLED", user)
  try {
    console.log("Deserializing user with uuid:", user);
    // const user = await locateEntry("uuid", uuid);
    console.log("deserialize", user);
    if (user!=="") {
      console.log("User found in DB:", user);
      done(null, user);
    } else {
        
      console.log("User not found or empty array", user);
      done(null, false);
    }
  } catch (err) {
    console.log("Error in deserialization:", err);
    done(err);
  }
});


passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  callbackURL: process.env.NODE_ENV?.toLowerCase() !== "dev"
    ? `${process.env.PROD_URL}/auth/google/callback`
    : "https://localhost:443/auth/google/callback"
},
async (accessToken: any, refreshToken: any, profile: any, cb: any) => {
  try {
    const email = profile.emails?.[0]?.value || "";
    const name = profile.displayName || "";
    const profilePic = profile.photos?.[0]?.value || "";
    
    console.log("em", email)
    console.log('name', name);
    console.log(profilePic)

    const user = await locateEntry("emailHash", md5(email.trim().toLowerCase()));
   
    console.log("User right now", user)
    if (Array.isArray(user)&&user.length===0) {
      const newUser = {
        uuid: profile.id,
        name: cmod.encrypt(name.toLowerCase().trim()),
        email: cmod.encrypt(email),
        emailHash: md5(email),
        // timesTaken: 0,
        // highestScore: 3,
        imgUrl: profilePic,
        // testsAvailable: 3,
        // allTests: [],
        password: "",
        trophies: 0,
        rightQuestionList: [],
        wrongQuestionList: [],
        // profilePic
      }
      const u = await addEntry(newUser);
      console.log("just finished adding new entry", u)
      return cb(null, newUser);
    } else if (Array.isArray(user) && typeof user[0] !== "undefined") {
        console.log("this is the user being passed", user)
        return cb(null, user[0]);
    } else {
        cb("Some error for some reason")
    }
    // console.log()
    // if (Array.isArray(user)&&) {
        
    // } else {
    //     console.log("the user is an array")
    //     cb("For some reason user is an array here.")
    // }
    
  } catch (err) {
    return cb(err);
  }
}));


// the type will look like this

// id: string = {
//  isFull: boolean,
//  players: [Connection, Connection];
//  
// 
// }

// 
// 
export const allLobbies = new Map<string, any>();

export const websocketToGame: {
  [key: string]: GameState
} = {


}

// this would be a list of ids
export const openLobbies: string[] = [
    
]




// Setting up cookies

// Setting up body parser
app.use(bodyParser.json({limit: "10mb"}))



// const server = http.createServer(app);
let server;

if (process.env.NODE_ENV === "DEV") {
    server = https.createServer(options, app);
} else {
    server = http.createServer(app);
}
// const server = http.createServer(app)
startWebsocket(server);




// app.get("")


app.get("/", (req: Request,res: Response) => {
    res.send("new year new me")
})


app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"],
    session: true
}))

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful auth
     const redirectUrl = process.env.NODE_ENV?.toLowerCase() === "dev" ? "http://localhost:5173" : process.env.FRONT_URL

    //     if (req.user) {
    //     req.logIn(req.user, (e) => {
    //         console.log("we are manually logging in", req.user)
    //         if (e) {
    //             console.error(e);
    //             res.redirect(redirectUrl + "/login")
    //         } else {
    //             console.log("Finally completed it correctly", req.user)
    //             res.redirect(redirectUrl + "/dashboard")
    //         }   
    //     })
    // }
    

   
    res.redirect(redirectUrl + "/dashboard");
  }
);



app.get("/findLobby", (req,res) => {
    if (req.isAuthenticated()) {
        let localLobbies = openLobbies;
        const maxIterations = 1000;
        let i=0;
        console.log("these are all the lobbies available", localLobbies);
        while (localLobbies.length>0 && i<maxIterations) {
            const lobbyChosen = allLobbies.get(localLobbies[0]);

            
            if (!lobbyChosen.isFull) {
                console.log("this lobby isn't full", lobbyChosen);
                res.status(200).send(craftRequest(200, localLobbies[0] ?? ""))
                return;
            } else {
                localLobbies.splice(0,1);
            }
            i++;
        }

        // lets make a new lobby then
        const lobbyId = v4();

        openLobbies.push(lobbyId);
        allLobbies.set(lobbyId, {
            isFull: false,
            players: []
        });



        res.status(200).send(craftRequest(200, lobbyId));
    } else {
        res.status(403).send(craftRequest(403));
    }
})



// Untested route
app.post("/sendReview", (req: any, res: any) => {
    try {

        const {wrongQuestions, rightQuestions} = req.body;

        if (req.isAuthenticated()) {
            updateEntry("uuid", req.user.uuid, {wrongQuestionList: [...req.user.wrongQuestionList, ...wrongQuestions], rightQuestionList: [...req.user.rightQuestionList, ...rightQuestions]}).then(() => {
                res.status(200).send(craftRequest(200));
                return;
            })            
        } else {
            res.status(400).send(craftRequest(400));
            return;

        }        
    } catch(e) {


        console.log(e);
        res.status(400).send(craftRequest(400));
    }



})





app.get("/logout", (req: any,res) => {


    req.logOut((e: any) => {
        if (e) {
            console.log(e);
            res.status(400).send(craftRequest(400));    
        } else {
            res.status(200).send(craftRequest(200));
        }
    })


})


// app.post("/login", (req: any, res, next) => {
//   passport.authenticate("local", (err: any, user: any, info: any) => {
//     console.log("this was err", err);
//     console.log("this was user", user)
//     console.log("this is info", info)
//     if (err) {
//       console.error(err);
//       return res.status(500).send(craftRequest(500)); // Server error
//     }

//     if (!user) {
//       // info.message can come from done(null, false, { message: 'Invalid password' })
//       return res.status(400).send(craftRequest(400));
//     }

//     // Manually log the user in
//     req.logIn(user, (err: any) => {
//       if (err) {
//         return res.status(500).send(craftRequest(500));
//       }
      
//       setCookie(req, user.uuid);
//       return res.status(200).send(craftRequest(200, req.user));
//     });
//   })(req, res, next);
// });

app.get("/isLoggedIn", (req: any,res) => {
    // const isAuthed = req.isAuthenticated()
      res.json({
    session: req.session,
    user: req.user,
    isAuth: req.isAuthenticated(),
  });
})

// app.post("/login", (req,res) => {

//     try {

//         const {email, password}: LoginBody = req.body;


//         if (isEmail(email) && isPassword(password)) {
//             locateEntry("emailHash", md5(email)).then((users: LocateEntryEntry) => {
//                 if (Array.isArray(users) && users.length > 0) {
//                     console.log(users[0])
//                     locateEntry("uuid", users[0].uuid).then((user: LocateEntryEntry) => {
//                         // console.log(thing);
//                         if (user != null&&user!=""&&!Array.isArray(user)) {
                            


//                             bcrypt.compare(password, user.password, (err: any,result: boolean) => {
//                                 if (err) {
//                                     console.log(err);
//                                     res.status(400).send(craftRequest(400));
//                                 } else {

                                    
//                                     if (result) {
//                                         setCookie(req, user.uuid);
//                                         res.status(200).send(craftRequest(200));
//                                     } else {
//                                         res.status(400).send(craftRequest(400));
//                                     }


//                                 }
//                             })

//                         } else {
//                             res.status(400).send(craftRequest(400));
//                         }
//                     })
//                 } else {
//                     res.status(400).send(craftRequest(400));
//                 }
//             })
//         } else {
//             res.status(403).send(craftRequest(403));
//         }



//     } catch(e) {

//         reportError(e);
//         res.status(400).send(craftRequest(400));
//     }



// }) 

app.get("/getUser", (req: any, res) => {
    console.log("Beginning of the getUser route")
//     console.log({
//     session: req.session,
//     user: req.user,
//     isAuth: req.isAuthenticated(),
//   });
    console.log("req sessionId", req.sessionID)


    
  if (req.isAuthenticated()) {
    console.log("this is req.user", req.user)

    locateEntry("uuid", req.user.uuid).then((u) => {
        
        if (u !== ""&&!Array.isArray(u)) {
            const user = u as User;
            res.status(200).send(craftRequest(200, {
                name: cmod.decrypt(user.name),
                email: cmod.decrypt(user.email),
                imgUrl: user.imgUrl,
                uuid: user.uuid,
                wrongQuestionList: user.wrongQuestionList,
                rightQuestionList: user.wrongQuestionList,
                trophies: user.trophies
            }))

        }
       

    })
    
  } else {
    res.status(400).send(craftRequest(400, "not signed in"))
  }


})


app.post("/dismissQuestion", (req: any, res: any) => {

    try {

        const {questionId} = req.body;
    
        if (req.isAuthenticated()&&questionId) {

            const user = req.user;

            const allQuestions = user.wrongQuestionList as string[];

            const newQuestions = allQuestions.filter((value: string, _: number) => String(value)!==String(questionId));

            updateEntry("uuid", req.user.uuid, {
                wrongQuestionList: newQuestions,
            }).then(() => {
                res.status(200).send(craftRequest(200));

            })
        
            

            




        } else {
            res.status(403).send(craftRequest(403));
        }


        

    } catch(e) {

        console.log(e);
        res.status(400).send(craftRequest(400));

    }



})



// app.post("/getQuestion", (req,res) => {
//     if (req.isAuthenticated()) {


//         const {isMath, difficulty, topic} : {
//             isMath: boolean,
//             difficulty: number,
//             topic: string,
//         } = req.body;

//         const mathSkills = ["Linear equations in one variable", "Linear functions", "Linear equations in two variables", "Systems of two linear equations in two variables", "Linear inequalities in one or two variables", "Nonlinear functions", "Nonlinear equations in one variable", "Systems of equations in two variables", "Equivalent expressions", "Ratios, rates, proportional relationships, and units", "Percentages", "One-variable data: Distributions and measures of center and spread", "Two-variable data: Models and scatterplots", "Probability and conditional probability", "Inference from sample statistics and margin of error", "Evaluating statistical claims: Observational studies and experiments", "Area and volume", "Lines, angles, and triangles", "Right triangles and trigonometry", "Circles"];
//         const englishSkills = ["Central Ideas and Details", "Inferences", "Command of Evidence", "Words in Context", "Text Structure in Purpose", "Cross-Text Connection", "Rhetorical Synthesis", "Transitions", "Boundaries", "Form, Structure, and Sense"];

//         const ourList = isMath ? mathSkills : englishSkills;
        
//         console.log('first bool', typeof isMath);
//         console.log('second bool', isNumber(difficulty));
//         console.log('third bool', isString(topic));
//         if (typeof isMath !== "undefined"&& isNumber(difficulty) && typeof topic === "string") {
        
//             queryEntries("skill", String(topic).trim(), "scoreBand", Number(difficulty), process.env.SECONDARY_DATABASE).then((questions: any[]) => {
//                 // console.log("this is questions", questions);
//                 if (Array.isArray(questions) && questions.length>0) {
//                     // filter by difficulty
//                     let notFoundYet = true;
//                     let qChosen: Question | undefined = undefined;
                    


//                     while (notFoundYet||qChosen === undefined) {
//                         let randomNum = Math.floor(Math.random()*questions.length);
//                         if (ourList.includes(questions[randomNum].skill.trim())) {
//                             qChosen = questions[randomNum];
//                             notFoundYet = false;
//                         }
//                     }
//                     // const questionChosen = questions[Math.floor(Math.random()*questions.length)];
//                     console.log("question chosen", qChosen);

//                     res.status(200).send(craftRequest(200, {
//                         question: qChosen
//                     }));

//                 } else {
//                     res.status(400).send(craftRequest(400, {question: {}}));
//                 }



//             })





//             // generate question here



            
        





//         } else {
//             res.status(400).send(craftRequest(400, "invalid parameters"))

//         }


//     } else {
//         res.status(400).send(craftRequest(400, "not signed in"))


//     }




// })


// app.post("/checkAnswer", (req,res) => {
//     try {
//         if (req.isAuthenticated()) {
//             console.log("")
//             const { questionId, gameId, answerChoice } = req.body;
//             if (questionId && gameId && answerChoice) {
//                 console.log("Question id is this: ", questionId)

//                 const lobby = allLobbies.get(gameId);
                
//                 if (lobby) {    
//                     locateEntry("questionId", questionId, process.env.SECONDARY_DATABASE).then((q: LocateEntryEntry) => {
//                         if (!Array.isArray(q)&&q !== "") {
//                             const question = q as Question;

//                             if (question.correctAnswer[0].toLowerCase() === answerChoice.toLowerCase()) {
                                

//                             } else {

//                             }
                        


//                             res.status(200).send(craftRequest(200, {
//                                 correctAnswer: question.correctAnswer
//                             }))
//                         } else {
//                             res.status(400).send(craftRequest(400));
//                         }
//                     })
//                 } else {
//                     res.status(400).send(craftRequest(400));
//                 }
              




//             }

          



//         } else {
//             res.status(403).send(craftRequest(403));
//         }






//     } catch(e) {
//         console.log(e);

//         res.status(400).send(craftRequest(400));
//     }


// })



app.post("/changeSettings", (req,res) => {

    try {

        // const {...x} = req.body;
        // console.log("req",req.body);
        authenticateUser(req).then((id: string) => {

            if (id === "No user found") {
    
                res.status(403).send(craftRequest(403))
            } else {
                
                locateEntry("uuid", id).then((u: LocateEntryEntry) => {

                    if (u !== ""&&!Array.isArray(u)) {
                        const user = u as User

                        const changedUser: any = {}
                        console.log(Object.keys(user))

                        Object.keys(user).map((key) => {
                            console.log("ajdsf", key)
                            if ((key !== "email") && (key !== "emailHash") && (key !== "password")) {
                                if (Object.keys(req.body).includes(key.toLowerCase())) {
                                    changedUser[key] = req.body[key];
                                }
                            }
                        })  


                        console.log("changed user", changedUser)
                        updateEntry("uuid", user?.uuid, changedUser).then((a) => {
                            console.log("a", a);
                            res.status(200).send(craftRequest(200));
                        })
                        return;
                        // do something here
                    } else {
                        res.status(400).send(craftRequest(400));
                    }
    
                    
                })
    
    
    
    
    
            }
    
    
    
        })


    } catch(e) {


        console.log(e)
        reportError(e);
        res.status(400).send(craftRequest(400));
        return;

    }
   


})



// This won't work
app.post("/sendCode", (req,res) => {
    try {

        const {email}: CodeBody = req.body;
        

        if (isEmail(email)) {
            locateEntry("emailHash", md5(email.trim())).then((users: LocateEntryEntry) => {
                // console.log("this is the",user)
                if (users !== ""&&Array.isArray(users)) {
                    // console.log(user);
                    const user = users[0]
                    const code = generateCode(6)

                    const text = `Hello,

You have asked to reset your password. If this wasn't you, ignore this email.

Your code is: ${code}`

                    // bookmark
                    console.log(user)
                    updateEntry("uuid", user.uuid, {passwordCode: code}).then((response: boolean) => {
                        if (response) {
                            sendEmail(email.trim(), `Reset Password - ${process.env.COMPANY_NAME}`,text).then((alert: boolean) => {
                                if (alert) {
                                    res.status(200).send(craftRequest(200));
                                } else {
                                    res.status(400).send(craftRequest(400));
                                }
                            
                            })
                        } else {
                            res.status(400).send(craftRequest(400));
                        }
                    })
                    


                } else {
                    res.status(400).send(craftRequest(400));
                }
            })


        } else {
            res.status(400).send(craftRequest(400));
        }




    } catch(e) {
        console.log(e);
        reportError(e);
        res.status(400).send(craftRequest(400));
    }
})




// app.post("/changePassword", (req,res) => {
//     try {
//         const {code, password, email} = req.body;

//         console.log(isPassword(password))
//         console.log(isNumber(code))

//         if (isPassword(password) && isNumber(code)) {


//             const emailHash = md5(email);

            

//             locateEntry("emailHash", emailHash).then((users: LocateEntryEntry) => {
//                 if (Array.isArray(users)&&users.length>0) {
//                     const user = users[0];

//                     locateEntry("uuid", user.uuid).then((user: LocateEntryEntry) => {
//                         if (!Array.isArray(user)&&user !== "") {

//                             if (String(user.passwordCode) === String(code)) {


//                                 if (isPassword(password)) {
                                    
                                    
//                                     bcrypt.hash(password, saltRounds, function(err: any, hash: string) {
//                                     // Store hash in your password DB.

//                                         if (err) {
//                                             reportError(err);
//                                             res.status(400).send(craftRequest(400))
                                            
//                                         } else {
                                            
//                                             updateEntry("uuid",user.uuid,{password: hash}).then((x) => {
//                                                 res.status(200).send(craftRequest(200));
//                                             })
//                                         }
//                                     });
                                    


//                                 } else {
//                                     res.status(400).send(craftRequest(400, {status: "invalid password"}))
//                                 }



                            


//                             } else {
//                                 res.status(400).send(craftRequest(400, {status: "invalid code"}))
//                             }

//                         } else {

//                             res.status(400).send(craftRequest(400));


//                         }

//                     })




//                 } else {



//                     res.status(403).send(craftRequest(403));
//                 }
//             })

            





//         } else {
//             console.log(code);
//             console.log(password);
//             console.log(email);
//             res.status(400).send(craftRequest(400));
//         }

//     } catch(e) {
//         console.log(e);
//         reportError(e);
//         res.status(400).send(craftRequest(400));
//     }
// })













server.listen(process.env.PORT, () => {
    console.log("Listening on port:", process.env.PORT)
})






