
export type Options = {
    key: Buffer;
    cert: Buffer;
    rejectUnauthorized?: boolean;
};


export type RegisterBody = {
    name: string;
    email: string;
    password: string;
    
}


export type LoginBody = {
    email: string;
    password: string;
}

export type CodeBody = {
    email: string;
}

export type ChangePasswordBody = {
    code: number;
    password: string;
    email: string;
}



export type Question = {
    questionId: string;
    scoreBand: number;
    skill: string;
    type: string;
    rationale: string;
    stem: string;
    stimulus: string;
    answerChoices: string[];
    correctAnswer: string[];
}




export type User = {
    uuid: string;
    name: string;
    emailHash: string;
    email: string;
    password: string;
    passwordCode?: number;
    imgUrl: string;
    trophies: number;
    rightQuestionList: any[];
    wrongQuestionList: any[];
}

export type BrowserUser = {
    uuid: string;
    name: string;
    email: string;
    imgUrl: string;

}


// At the function
export type LocateEntryType = Promise<User | User[] | "" | Question>;


// At function call
export type LocateEntryEntry =  "" | User | User[] | Question;


