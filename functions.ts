// const nodemailer = require("nodemailer")
import nodemailer from "nodemailer";
import { Request, Response, NextFunction } from "express";
import { json } from "body-parser";
import he from 'he';
import { addEntry } from "./databaseFunctions";
declare module "express-session" {
  interface SessionData {
    user?: string;
  }
}

function authenticateUser(req: Request) {
  if (req.isAuthenticated()) {
    return req.user;
  } else {
    return "No user found";
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  return new Promise(async (resolve) => {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        // TODO: replace `user` and `pass` values from <https://forwardemail.net>
        user: process.env.EMAIL_SENDER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
    if (to.length > 0 && subject.length > 0 && text.length > 0) {
      const info = await transporter.sendMail({
        from: process.env.EMAIL_SENDER, // sender address
        to: to, // list of receivers
        subject: subject, // Subject line
        text: text,
      });

      resolve(true);
    } else {
      resolve(false);
    }
  });
}

async function reportError(err: any) {
  if (err.length > 0 && process.env.EMAIL_PERSONAL) {
    await sendEmail(process.env.EMAIL_PERSONAL, "Report Bug #", err);
    return true;
  } else {
    return false;
  }
}

function isEmail(email: string) {
  let passedTests = true;

  if (email.split("@").length !== 2) {
    passedTests = false;
  } else if (email.length < 4) {
    passedTests = false;
  } else if (email.length > 40) {
    passedTests = false;
  }

  return passedTests;
}

function isPassword(password: string) {
  let passedTests = true;

  if (password.length < 4) {
    passedTests = false;
  } else if (password.length > 15) {
    passedTests = false;
  }

  return passedTests;
}

function isString(s: string, lengthLimit = 1000000) {
  const string = String(s);
  for (let i = 0; i < string.length; i++) {
    if (!/^[a-zA-Z]$/.test(string[i])) {
      return false;
    }
  }

  if (string.length < lengthLimit) {
    return true;
  } else {
    return false;
  }
}

function isNumber(number: string, lengthLimit = 100000) {
  const string = String(number);
  for (let i = 0; i < string.length; i++) {
    if (isNaN(Number(string[i]))) {
      return false;
    }
  }

  if (string.length < lengthLimit) {
    return true;
  } else {
    return false;
  }
}

function generateCode(length: number) {
  let code = ""; // Initialize code as an empty string
  const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  for (let i = 0; i < length; i++) {
    code += String(numbers[Math.floor(Math.random() * numbers.length)]); // Fix off-by-one error
  }

  return code;
}

function craftRequest(code: number, body: object) {
  if (code === 403 || code === 404 || code === 400) {
    return JSON.stringify({
      code: "err",
      message: JSON.stringify(body) || "invalid request",
    });
  } else if (code === 200) {
    return JSON.stringify({
      code: "ok",
      message: JSON.stringify(body) || "success",
    });
  } else if (code === 307) {
    return JSON.stringify({
      code: "ok",
      message: JSON.stringify(body) || "login",
    });
  } else {
    ("code not found");
  }
}


function scrapeAllQuestions() {
    const allQuestions = [];
    return new Promise((resolve) => {




        console.log("get question called")

        const myHeaders = new Headers();
        myHeaders.append("accept", "application/json");
        myHeaders.append("accept-language", "en-US,en;q=0.9");
        myHeaders.append("content-type", "application/json");
        myHeaders.append("origin", "https://satsuitequestionbank.collegeboard.org");
        myHeaders.append("priority", "u=1, i");
        myHeaders.append("referer", "https://satsuitequestionbank.collegeboard.org/");
        myHeaders.append("sec-ch-ua", "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"");
        myHeaders.append("sec-ch-ua-mobile", "?0");
        myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
        myHeaders.append("sec-fetch-dest", "empty");
        myHeaders.append("sec-fetch-mode", "cors");
        myHeaders.append("sec-fetch-site", "same-site");
        myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36");
        const raw = JSON.stringify({
            "asmtEventId": 99,
            "test": 1,
            "domain": "INI,CAS,EOI,SEC"
        });

        const requestOptions: RequestInit = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        fetch("https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions", requestOptions)
            .then(async (response) => {
                try {
                    const jsonResponse = JSON.parse(await response.text())

                    for (let i = 0; i < jsonResponse.length; i++) {
                        const currQuestion = jsonResponse[i];

                        if (currQuestion.program === "SAT" && (Number(currQuestion.score_band_range_cd) >= 4)) {

                            // const randomQuestion = jsonResponse[Math.floor(Math.random()*jsonResponse.length)]
                            const myHeaders = new Headers();
                            myHeaders.append("accept", "application/json");
                            myHeaders.append("accept-language", "en-US,en;q=0.9");
                            myHeaders.append("content-type", "application/json");
                            myHeaders.append("origin", "https://satsuitequestionbank.collegeboard.org");
                            myHeaders.append("priority", "u=1, i");
                            myHeaders.append("referer", "https://satsuitequestionbank.collegeboard.org/");
                            myHeaders.append("sec-ch-ua", "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"");
                            myHeaders.append("sec-ch-ua-mobile", "?0");
                            myHeaders.append("sec-ch-ua-platform", "\"Windows\"");
                            myHeaders.append("sec-fetch-dest", "empty");
                            myHeaders.append("sec-fetch-mode", "cors");
                            myHeaders.append("sec-fetch-site", "same-site");
                            myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36");
                            const raw = JSON.stringify({
                                "external_id": currQuestion.external_id
                            });
                            const requestOptions: RequestInit = {
                                method: "POST",
                                headers: myHeaders,
                                body: raw,
                                redirect: "follow"
                            };
                            
                            console.log("we just made a fetch", i);
                            await new Promise(r => setTimeout(r, 3000 + Math.random()));
                            await fetch("https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question", requestOptions)
                                .then(async (response) => {
                                    const jsonQuestion = JSON.parse(await response.text());
                                    // console.log("got the question", jsonQuestion);
                                    const htmlRegex = /<\/?[^>]+>/g;
                                    function stripHTML(htmlString: string) {
                                        return he.decode(htmlString.replace(htmlRegex, ''));
                                    }
                            


                                    const newQuestion = {
                                        questionId: currQuestion.questionId,
                                        scoreBand: Number(currQuestion.score_band_range_cd),
                                        skill: String(currQuestion.skill_desc),
                                        type: String(jsonQuestion.type),
                                        rationale: stripHTML(jsonQuestion.rationale),
                                        stem: stripHTML(jsonQuestion.stem),
                                        stimulus: stripHTML(jsonQuestion.stimulus),
                                        answerChoices: jsonQuestion.answerOptions.map((choice: any) => {
                                            return stripHTML(choice.content);
                                        }),
                                        correctAnswer: jsonQuestion.correct_answer,
                                    }

                                    addEntry(newQuestion as any, process.env.SECONDARY_DATABASE);
                                    allQuestions.push(newQuestion);
                                    console.log(newQuestion)
                                    // console.log(jsonQuestion)
                                    resolve(jsonQuestion);

                                })
                                .catch((error) => console.error(error));
                        } else {
                            console.log("skipping because it didn't match our requirements")
                            continue;
                        }

                    }



                } catch (e) {
                    console.log(e)
                }


            }).catch((error) => console.error(error));

    })





}


function setCookie(req: Request, uuid: string) {
  if (req && uuid) {
    req.session.user = uuid;
    return true;
  } else {
    return false;
  }
}

// scrapeAllQuestions();

module.exports = {
  authenticateUser,
  isNumber,
  reportError,
  sendEmail,
  isEmail,
  isPassword,
  craftRequest,
  isString,
  setCookie,
  generateCode,
};
