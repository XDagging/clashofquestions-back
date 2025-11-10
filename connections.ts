import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { allLobbies, openLobbies } from "./app";
import { sessionMiddleware } from "./app";
import { IncomingMessage } from "http";
import { v4 as uuidv4 } from "uuid"; // Use UUIDs to uniquely identify characters

const {
  authenticateUser,
  isEmail,
  isPassword,
  isString,
  isNumber,
  reportError,
  craftRequest,
  setCookie,
  sendEmail,
  generateCode,
} = require("./functions.js");
import type { LocateEntryEntry, Question } from "./types";
import { User } from "./types";
import { clearInterval } from "timers";
import { websocketToGame } from "./app";
import e from "express";
import { locateEntry, queryEntries, updateEntry } from "./databaseFunctions";
// import type { Server } from "http";
interface AuthenticatedWebSocket extends WebSocket {
  user: User;
  gameId?: string;
}
type Tile = {
  x: number;
  y: number;
};

const cardDefinitions = {
  tower: {
    sprite: "tower",
    name: "tower",
    cost: 0,
    type: "tower",
    health: 2000,
    maxHealth: 2000,
    damage: 25,
    attackRadius: 500,
    attackSpeed: 1.2,
  },
  shooterMonkey: {
    sprite: "shooterMonkeyFront",
    name: "shooterMonkey",
    cost: 1,
    type: "troop",
    health: 100,
    maxHealth: 100,
    damage: 20,
    attackRadius: 300,
    speed: 200,
    attackSpeed: 1.2,
  }, 
  giant: {
    sprite: "giantFront",
    cost: 4,
    name: "giant",
    type: "troop",
    health: 400,
    maxHealth: 400,
    damage: 200,
    attackRadius: 150,
    speed: 100,
    attackSpeed: 1.2,
  },
  monkey: {
    sprite: "monkeyFront",
    cost: 2,
    name: "monkey",
    type: "troop",
    health: 200,
    maxHealth: 200,
    damage: 150,
    attackRadius: 150,
    speed: 150,
    attackSpeed: 0.6,
  }, 
  fireball: {
    sprite: "fireball",
    cost: 5,
    name: "fireball",
    type: "spell",
    health: 1,
    maxHealth: 1,
    damage: 200,
    attackRadius: 1000,
    speed: 20,
    attackSpeed: 1.2,
  }



};

function fillWithBot(gameId: string) {
  const lobby = allLobbies.get(gameId);

  if (lobby.isFull) {
    return false;
  } else {
    allLobbies.set(gameId, {
      ...lobby,
      players: [lobby.players[0], "AI"],
      isFull: true,
    });

    return true;
  }
}

function checkVacancy(gameId: string, ws: any) {
  const lobby = allLobbies.get(gameId);

  // Lobby doesn't exist or is already full
  if (!lobby || lobby.isFull) {
    console.log("Vacancy check failed: Lobby not found or is full.", gameId);
    return false;
  }

  // Add the new player
  const newPlayers = [...lobby.players, ws];
  // Check if the lobby is full *now*
  const isNowFull = newPlayers.length === 2; // Assuming max 2 players

  // Update the lobby in allLobbies
  allLobbies.set(gameId, {
    ...lobby, // Carry over other properties
    players: newPlayers,
    isFull: isNowFull,
  });

  // *** THIS IS THE FIX ***
  // Only remove the lobby from the open list *if it is now full*.
  if (isNowFull) {
    console.log(`Lobby ${gameId} is now full. Removing from openLobbies.`);

    // A more efficient way to find and remove the item
    const index = openLobbies.indexOf(gameId);
    if (index > -1) {
      openLobbies.splice(index, 1);
    }
  } else {
    console.log(`Lobby ${gameId} now has 1 player. Keeping in openLobbies.`);
  }

  return true;
}

// In your server code

// A simple Vector2 class for server-side math
class Vec2 {
  public x: number;
  public y: number;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Calculates the Euclidean distance to another vector.
   */
  public dist(other: Vec2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Subtracts another vector from this one and returns the result as a new Vec2.
   * @param other - The Vec2 to subtract.
   * @returns A new Vec2 instance representing the difference.
   */
  public sub(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  /**
   * Multiplies the vector by a scalar value and returns the result as a new Vec2.
   * @param scalar - The number to multiply the vector by.
   * @returns A new Vec2 instance representing the scaled vector.
   */
  public scale(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  /**
   * Calculates the unit vector (a vector with the same direction and a magnitude of 1).
   * @returns A new Vec2 instance representing the unit vector. Returns a zero vector if the magnitude is 0.
   */
  public unit(): Vec2 {
    const magnitude = Math.sqrt(this.x * this.x + this.y * this.y);
    if (magnitude === 0) {
      return new Vec2(0, 0); // Avoid division by zero
    }
    return new Vec2(this.x / magnitude, this.y / magnitude);
  }
}

class Character {
  public id: string;
  public ownerId: string; // Which player owns this character
  public name: string;
  public health: number;
  public maxHealth: number;
  public damage: number;
  public speed: number;
  public attackRadius: number;
  public attackSpeed: number;
  public attackTimer: number = 0;
  public type: "troop" | "spell" | "tower";
  public pos: Vec2;
  public vel: Vec2 = new Vec2(0, 0);
  // public allCharacters: any[];
  public finalTile: Tile | null = null;
  public isDead: boolean = false;
  public isBackwards: boolean = false;
  public animation:
    | "idle"
    | "FrontAnimationShooting"
    | "BackAnimationShooting"
    | "FrontWalking"
    | "BackWalking"
    | "Shooting" = "idle";

  // Simplified server-side state
  public currentTargetId: string | null = null;

  public waypoints: any[] = [];

  constructor(
    cardData: any,
    ownerId: string,
    startPos: Vec2,
    isBackwards?: boolean
  ) {
    this.id = uuidv4(); // Assign a unique ID
    this.ownerId = ownerId;

    this.pos = startPos;
    this.isBackwards = isBackwards || false;

    // Copy stats from card data
    this.name = cardData.name;
    this.health = cardData.health;
    this.maxHealth = cardData.maxHealth;
    this.damage = cardData.damage;
    this.speed = cardData.speed;
    this.attackRadius = cardData.attackRadius;
    this.attackSpeed = cardData.attackSpeed;
    this.type = cardData.type;
    // this.allCharacters = allCharacters;
  }

  public takeDamage(amount: number) {
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      // The GameState will handle removing this character
    }
  }

  public attackPlayer(player: any): void {
    // if (this.type === "tower") {
    //     console.log(`--- TOWER ATTACK DEBUG ---`);
    //     console.log(`[SERVER] Tower ${this.id.substring(0, 5)} is attempting to attack target ${player.id.substring(0, 5)}.`);
    //     console.log(` > Tower Stats: damage=${this.damage}, attackSpeed=${this.attackSpeed}, attackTimer=${this.attackTimer}`);
    //     console.log(` > Target Health (Before): ${player.health}`);
    // }
    if (this.attackTimer > 0) {
      return;
    }
    if (this.type === "tower") {
      this.animation = "Shooting";

      // Towers don't need directional logic, so we can exit here for them
      // return;
    } else {
      if (this.pos.y > player.pos.y) {
        // Attacker is BELOW the target, so it should face UP (Back)
        this.animation = "BackAnimationShooting";
      } else {
        // Attacker is ABOVE the target, so it should face DOWN (Front)
        this.animation = "FrontAnimationShooting";
      }
    }

    // NEW LOGIC: Determine direction based on target's position

    player.takeDamage(this.damage);
    this.attackTimer = this.attackSpeed;
  }

  public findNearEnemies(allCharacters: Character[]) {
    return allCharacters.filter((x: any) => x.ownerId !== this.ownerId);
  }

  public isTileBlocked(
    tileX: number,
    tileY: number,
    allCharacters: Character[]
  ) {
    const TILE_SIZE = 16; // Assuming your tile size is 32
    const obstacles = allCharacters.filter((char) => {
      return char.type === "tower";
    }); // Get all objects with the "object" tag

    for (const obs of obstacles) {
      const obsTileX = Math.floor(obs.pos.x / TILE_SIZE);
      const obsTileY = Math.floor(obs.pos.y / TILE_SIZE);

      if (obsTileX === tileX && obsTileY === tileY) {
        return true; // Found an obstacle on this tile
      }
    }

    return false; // No obstacle found
  }

  public moveAlgo(allCharacters: Character[]) {
    let closestTarget = null;
    let closestDistance = Infinity;

    const primaryTargets = this.findNearEnemies(allCharacters);

    if (primaryTargets.length === 0) {
      console.log("primary targets is null for some reason");
      this.waypoints = [];
      this.currentTargetId = null;
      return;
    }

    for (const target of primaryTargets) {
      const distance = this.pos.dist(target.pos);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTarget = target;
      }
    }

    if (!closestTarget) {
      return;
    }

    this.currentTargetId = closestTarget.id;

    let currNode: Tile = {
      x: Math.floor(this.pos.x / 16),
      y: Math.floor(this.pos.y / 16),
    };

    const closedList = new Set<string>();

    closedList.add(`${currNode.x},${currNode.y}`);
    // console.log("this is what closestTarget is", closestTarget)

    // console.log("this is the computed attack radius", attackVector);

    const maxPathLength = 200;

    let pathLength = 0;
    this.finalTile = {
      x: Math.floor(closestTarget.pos.x / 16),
      y: Math.floor(closestTarget.pos.y / 16),
    };

    const firstTile: Tile = {
      x: Math.floor(this.pos.x / 16),
      y: Math.floor(this.pos.y / 16),
    };

    while (
      (currNode.x !== this.finalTile.x || currNode.y !== this.finalTile.y) &&
      pathLength < maxPathLength
    ) {
      //   console.log('we are here being run');
      let winningG = 100000;
      let winningH = 100000;
      let winningTile: Tile | null = null;

      // Could do a forloop, but honestly hardcoding would be easier here

      for (let i = 1; i < 9; i++) {
        const nodeInAttempt = {
          x: currNode.x,
          y: currNode.y,
        };
        if (i <= 3) {
          nodeInAttempt.x -= 1;
        } else if (i >= 6) {
          nodeInAttempt.x += 1;
        }

        if (i === 1 || i === 4 || i === 6) {
          nodeInAttempt.y += 1;
        } else if (i === 3 || i === 5 || i === 8) {
          nodeInAttempt.y -= 1;
        }

        const nodeKey = `${nodeInAttempt.x},${nodeInAttempt.y}`;
        if (closedList.has(nodeKey)) {
          continue; // If we've already been to this tile, skip it!
        }
        if (
          this.isTileBlocked(nodeInAttempt.x, nodeInAttempt.y, allCharacters)
        ) {
          continue;
        }

        const nodeG = Math.sqrt(
          Math.pow(nodeInAttempt.x - firstTile.x, 2) +
            Math.pow(nodeInAttempt.y - firstTile.y, 2)
        );
        const nodeH = Math.sqrt(
          Math.pow(nodeInAttempt.x - this.finalTile.x, 2) +
            Math.pow(nodeInAttempt.y - this.finalTile.y, 2)
        );

        if (
          winningG + winningH > nodeG + nodeH ||
          (winningG + winningH === nodeG + nodeH && nodeH < winningH)
        ) {
          //   console.log("we found a winning tile right here")
          winningG = nodeG;
          winningH = nodeH;
          winningTile = nodeInAttempt;

          pathLength++;
        }
      }

      if (winningTile !== null) {
        this.waypoints.push(winningTile);
        currNode = winningTile;
        closedList.add(`${currNode.x},${currNode.y}`);
      } else {
        console.error("Pathfinding failed: Character is trapped.");
        break;
      }
    }
  }

  private move(allCharacters: Character[]) {
    if (this.waypoints.length === 0) {
      this.moveAlgo(allCharacters);
    }

    if (this.waypoints.length > 0 && this.finalTile) {
      const finalDestPos = new Vec2(
        this.finalTile.x * 16 + 8,
        this.finalTile.y * 16 + 8
      );

      while (this.waypoints.length > 0) {
        const nextWaypointPos = new Vec2(
          this.waypoints[0].x * 16 + 8,
          this.waypoints[0].y * 16 + 8
        );

        const distCharToGoal = this.pos.dist(finalDestPos);
        const distWaypointToGoal = nextWaypointPos.dist(finalDestPos);

        if (distCharToGoal < distWaypointToGoal) {
          // We are closer to the end than this waypoint is. It's redundant. Skip it.
          this.waypoints.shift();
        } else {
          // This is the correct waypoint to move towards. Stop checking.
          break;
        }
      }

      if (this.waypoints.length === 0) {
        this.vel = new Vec2(0, 0);
        return false;
      }

      const nextWaypoint = this.waypoints[0];

      const targetPos = new Vec2(
        nextWaypoint.x * 16 + 8,
        nextWaypoint.y * 16 + 8
      );

      if (this.pos.dist(targetPos) < 4) {
        this.waypoints.shift();
        if (this.waypoints.length === 0) {
          this.vel = new Vec2(0, 0);
          return false;
        }
      }

      const direction = targetPos.sub(this.pos).unit();
      this.vel = direction.scale(this.speed);

      if (this.vel.y > 0) {
        this.animation = "BackWalking";
      } else {
        this.animation = "FrontWalking";
      }
      // this.updateAnimation(direction);

      return true; // We are actively moving
    }
    this.vel = new Vec2(0, 0);
    return false;
  }
  // This update method will be called on every server tick
  public update(deltaTime: number, allCharacters: Character[]) {
    if (this.attackTimer > 0) {
      this.attackTimer -= deltaTime;
    }

    // This is the crucial part: We use the "allCharacters" list that was
    // passed into this function from the main game loop. It is always up-to-date.
    const enemies = this.findNearEnemies(allCharacters);

    let targetedEnemy: Character | null = null;
    let targetInRange = false;

    const allEnemiesInRange = [];
    for (const target of enemies) {
      // This check is also important to ignore already-defeated targets
      if (target.health <= 0) {
        continue;
      }

      const distance = this.pos.dist(target.pos);

      if (distance <= this.attackRadius) {
        targetInRange = true;
        targetedEnemy = target;

        allEnemiesInRange.push(target);
        break;
      }
    }

    if (targetInRange && targetedEnemy) {
      // If a target is found, attack it.

      if (this.type !== "spell") {
        // console.log(
        //   // "we are a " + this.type + " and we are attacking a single enemy"
        // );
        this.attackPlayer(targetedEnemy);
        this.waypoints = [];
        this.vel = new Vec2(0, 0);
      } else {
        console.log("we are a spell attacking right now");
        for (const enemy of allEnemiesInRange) {
          console.log("we are attacking multiple enemise which are:", enemy);
          this.attackPlayer(enemy);
        }

        this.health = -1000;
      }
    } else if (this.type !== "tower") {
      this.animation = "idle";
      // If no target is in range AND this character is a troop, it should move.
      // NOTE: Make sure your `move` method is also updated to accept allCharacters if it needs to.
      this.move(allCharacters);
    } else {
      // console.log("the tower's animation is idle");
      this.animation = "idle";
    }

    // Animation and position logic remains the same
    if (
      this.vel.x === 0 &&
      this.vel.y === 0 &&
      this.animation.includes("Walking")
    ) {
      this.animation = "idle";
    }

    this.pos.x += this.vel.x * deltaTime;
    this.pos.y += this.vel.y * deltaTime;
  }

  // This will decide

  // Find closest enemy...
  // If in range, attack...
  // Else, move towards them...

  // Update position based on velocity
}

type PlayerStats = {
  coconuts: number;
  deck: any[];
  playerId: string;
  multiplier: number;
  question: any;
  towersRemaining: number;
};
// In your server code
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 1800;
export class GameState {
  public gameId: string;
  public playerOneConnection: any;
  public playerTwoConnection: any;
  public gameSettings = {
    isMath: false,
    difficulty: 6,
    topic: "Words in Context",
  };

  public playerOneStats: PlayerStats = {
    coconuts: 8,
    deck: [
      cardDefinitions["shooterMonkey"],
      cardDefinitions["giant"],
      cardDefinitions["monkey"],
      cardDefinitions["fireball"]
    ],
    playerId: "",
    multiplier: 1,
    question: {},
    towersRemaining: 3,
    // we should keep the current question here
  }; // Keep this for coconuts, deck, etc.
  public playerTwoStats: PlayerStats = {
    coconuts: 8,
    deck: [
      cardDefinitions["shooterMonkey"],
      cardDefinitions["giant"],
      cardDefinitions["monkey"],
      cardDefinitions["fireball"]
    ],
    playerId: "",
    multiplier: 1,
    question: {},
    towersRemaining: 3,
    // we should keep the current question here
  };


  
  public allCharacters: Character[] = [];
  private gameLoop: NodeJS.Timeout | null = null;
  private readonly TICK_RATE = 1000 / 30; // 30 ticks per second

  private botLogicTimer: number = 0; // Time until next decision
  private readonly BOT_DECISION_TICK = 1.0; // Bot thinks every 1 second
  // private botAnswerTimer: number = 5.0; // Time until next answer
  // private readonly BOT_ANSWER_DELAY = 5.0 + (Math.random() * 3); // 5-8s delay


  constructor(
    playerOne: any,
    playerTwo: any,
    playerOneId: string,
    playerTwoId: string
  ) {
    this.gameId = uuidv4();
    this.playerOneConnection = playerOne;
    this.playerTwoConnection = playerTwo;

    this.playerOneStats.playerId = playerOneId;
    this.playerTwoStats.playerId = playerTwoId;

    // initial tower spawn;

    this.getNewQuestion(playerOneId);
    this.getNewQuestion(playerTwoId);
    this.towerSetup();

    // Initialize player stats...
  }

  public towerSetup() {
    const paddingX = WORLD_WIDTH * 0.1;

    const leftTowerX = paddingX;
    const rightTowerX = WORLD_WIDTH - paddingX;
    const middleTowerX = WORLD_WIDTH / 2;

    // 3. Define the Y positions for top and bottom towers
    // Place them 15% from the top and bottom of the screen
    const enemyTowerY = WORLD_HEIGHT * 0.15;
    const friendlyTowerY = WORLD_HEIGHT * 0.75;

    const addTower = (pos: Vec2, playerNumber: number) => {
      const ownerId =
        playerNumber === 1
          ? this.playerOneStats.playerId
          : this.playerTwoStats.playerId;

      // --- ADD THIS DEBUGGING BLOCK ---
      //         console.log(`--- Creating Tower ---`);
      //      console.log(`- For Player Number: ${playerNumber}`);
      // console.log(`- Player 1 Full ID: ${this.playerOneStats.playerId}`);
      // console.log(`- Player 2 Full ID: ${this.playerTwoStats.playerId}`);
      // console.log(`-> Assigned Owner ID: ${ownerId}`);
      // console.log(`----------------------`);
      // // --- END DEBUGGING BLOCK ---
      console.log(
        "this is the ownerID being used for the tower creation:",
        ownerId
      );

      const tower = new Character(cardDefinitions["tower"], ownerId, pos, ownerId===this.playerOneStats.playerId ? false : true);
      this.allCharacters.push(tower);
    };

    addTower(new Vec2(leftTowerX, enemyTowerY), 2);
    addTower(new Vec2(middleTowerX, enemyTowerY), 2);
    addTower(new Vec2(rightTowerX, enemyTowerY), 2);

    // Friendly towers (bottom)

    addTower(new Vec2(leftTowerX, friendlyTowerY), 1);
    addTower(new Vec2(middleTowerX, friendlyTowerY), 1);
    addTower(new Vec2(rightTowerX, friendlyTowerY), 1);
  }

  public addElixir(isPlayerOne: boolean, isWrong: boolean) {
    if (isPlayerOne) {
      if (isWrong) {
        if (this.playerOneStats.multiplier >= 0.4) {
          this.playerOneStats.multiplier = this.playerOneStats.multiplier - 0.4;
        } else {
          // do nothing
        }
        
      } else {
        this.playerOneStats.multiplier = this.playerOneStats.multiplier + 0.4;
      }
    } else {
      if (isWrong) {

        if (this.playerTwoStats.multiplier >= 0.4) {
          this.playerTwoStats.multiplier = this.playerTwoStats.multiplier - 0.4;
        } else {
          // do nothing bud
        }
        
      } else {
        this.playerTwoStats.multiplier = this.playerTwoStats.multiplier + 0.4;
      }
    }
  }

  // here im going to put all the bot logic

  // the bot will have the default elixir multiplier the whole time.


  // This distanceAway parameter should be closest to the tower, not the other way around.
  private getDefensivePlacement(threat: Character, distance: number): Vec2 {
    let y = threat.pos.y - distance;
    
    // Constrain to bot's side (top half of the map)
    if (y < 50) y = 50; // Don't place off-map
    // CRUCIAL: Bot cannot place in player 1's territory
    if (y > (WORLD_HEIGHT / 2) - 50) y = (WORLD_HEIGHT / 2) - 50; 
    
    let x = threat.pos.x + (Math.random() * 60 - 30); // Place slightly off-center
    if (x < 50) x = 50;
    if (x > WORLD_WIDTH - 50) x = WORLD_WIDTH - 50;
    
    return new Vec2(x, y);
}

/**
 * Finds a valid offensive placement spot (e.g., at the back).
 */
  private getOffensivePlacement(): Vec2 {
    // Place at the "back" (top of the map) in a random lane
    const x = Math.random() < 0.5 ? WORLD_WIDTH * 0.25 : WORLD_WIDTH * 0.75;
    const y = WORLD_HEIGHT * 0.1; // 10% from the top edge
    return new Vec2(x, y);
  }

  public executeBotCardPlay() {
    const coconuts = this.playerTwoStats.coconuts;
    const deck = this.playerTwoStats.deck;


    // These are the enemy troops
    const p1_troops = this.allCharacters.filter(c => 
        c.ownerId === this.playerOneStats.playerId && c.type === 'troop'
    );

    // my towers
    const bot_towers = this.allCharacters.filter(c =>
        c.ownerId === this.playerTwoStats.playerId && c.type === 'tower'
    );

    const threats = p1_troops.filter(t => t.pos.y < WORLD_HEIGHT / 2);


    console.log("We need to check if threats are in our corner of the board", threats);


    if (threats.length > 0) {
      let closestThreat: Character | null = null;
        let minDistance = Infinity;

        for (const threat of threats) {
            for (const tower of bot_towers) {
                if (tower.health <= 0) continue; // Ignore dead towers
                const dist = threat.pos.dist(tower.pos);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestThreat = threat;
                }
            }
        }

        if (closestThreat) {
            // Now, try to counter it
            
            // Counter a 'giant' (tank) with 'shooterMonkey' (dps)
            const shooterCard = cardDefinitions.shooterMonkey;
            if (closestThreat.name === 'giant' && coconuts >= shooterCard.cost) {
                const placementPos: Vec2 = this.getDefensivePlacement(closestThreat, 150);
                this.handlePlaceCharacter(this.playerTwoStats.playerId, shooterCard.name, placementPos);
                return; // Action taken
            }

            // Counter a 'shooterMonkey' or 'monkey' (squishy) with 'fireball'
            const fireballCard = cardDefinitions.fireball;
            if (coconuts >= fireballCard.cost && minDistance < 250) { // If threat is close to tower
                this.handlePlaceCharacter(this.playerTwoStats.playerId, fireballCard.name, closestThreat.pos);
                return; // Action taken
            }
            
            // Default defense: place a 'monkey' on it
            const monkeyCard = cardDefinitions.shooterMonkey;
            if (coconuts >= monkeyCard.cost) {
                const placementPos = this.getDefensivePlacement(closestThreat, 10); // Place close
                this.handlePlaceCharacter(this.playerTwoStats.playerId, monkeyCard.name, placementPos);
                return; // Action taken
            }
        }


    } else {

      // we aren't being attacked right now, so we can do our push;


      const giantCard = cardDefinitions.giant;
      if (coconuts >= 8 && coconuts >= giantCard.cost) {
        const placementPos = this.getOffensivePlacement(); // Place at the back
        this.handlePlaceCharacter(this.playerTwoStats.playerId, giantCard.name, placementPos);
        return; // Action taken
      }

    // --- Tactic 3: Cycle Card (Low Priority) ---
    // If elixir is maxed out, don't waste it. Play a cheap card.
      const cheapCard = cardDefinitions.shooterMonkey;
      if (coconuts >= 9.5 && coconuts >= cheapCard.cost) { // Almost maxed
         const placementPos = this.getOffensivePlacement(); // At the back
         this.handlePlaceCharacter(this.playerTwoStats.playerId, cheapCard.name, placementPos);
         return; // Action taken
      }







    }
    // here's how we are going to code it

    // 1st priority will be the things that are about to attack us





    // 2nd priority is offense, it will start a push by putting a tank in the back






  }


  public updateBot(deltaTime: number) {
    this.botLogicTimer -= deltaTime;

    if (this.botLogicTimer <= 0) {
      this.executeBotCardPlay();
      this.botLogicTimer = this.BOT_DECISION_TICK;


    }


  }
























  public startGame() {
    this.gameLoop = setInterval(() => {
      this.update();
    }, this.TICK_RATE);
  }

  private updateCoconutAmounts(dt: number) {
    const defaultRate = 3;
    const maxCoconuts = 10;

    const newRateOne = defaultRate / this.playerOneStats.multiplier;
    const newRateTwo = defaultRate / this.playerTwoStats.multiplier;
    const timeConstant = dt;

    if (this.playerOneStats.coconuts < maxCoconuts) {
      this.playerOneStats.coconuts += timeConstant / newRateOne;
    }

    if (this.playerTwoStats.coconuts < maxCoconuts) {
      this.playerTwoStats.coconuts += timeConstant / newRateTwo;
    }
  }

  public async checkAnswer(id: string, inputAnswer: string) {
    const currentUser =
      id === this.playerOneStats.playerId
        ? this.playerOneStats
        : this.playerTwoStats;

    const wasRight = inputAnswer.trim().toLowerCase() === currentUser.question.correctAnswer[0].toLowerCase()

    this.addElixir(this.playerOneStats.playerId === id ? true : false, !wasRight);
    const question: any = await this.getNewQuestion(id);

    return {...question, wasRight: wasRight, answer: currentUser.question.correctAnswer[0].toLowerCase()};
  }

  private getNewQuestion(id: string) {
    return new Promise((resolve) => {
      try {
        const currentUser =
          id === this.playerOneStats.playerId
            ? this.playerOneStats
            : this.playerTwoStats;

        const { isMath, difficulty, topic } = this.gameSettings;

        const mathSkills = [
          "Linear equations in one variable",
          "Linear functions",
          "Linear equations in two variables",
          "Systems of two linear equations in two variables",
          "Linear inequalities in one or two variables",
          "Nonlinear functions",
          "Nonlinear equations in one variable",
          "Systems of equations in two variables",
          "Equivalent expressions",
          "Ratios, rates, proportional relationships, and units",
          "Percentages",
          "One-variable data: Distributions and measures of center and spread",
          "Two-variable data: Models and scatterplots",
          "Probability and conditional probability",
          "Inference from sample statistics and margin of error",
          "Evaluating statistical claims: Observational studies and experiments",
          "Area and volume",
          "Lines, angles, and triangles",
          "Right triangles and trigonometry",
          "Circles",
        ];
        const englishSkills = [
          "Central Ideas and Details",
          "Inferences",
          "Command of Evidence",
          "Words in Context",
          "Text Structure in Purpose",
          "Cross-Text Connection",
          "Rhetorical Synthesis",
          "Transitions",
          "Boundaries",
          "Form, Structure, and Sense",
        ];

        const ourList = isMath ? mathSkills : englishSkills;

        if (
          typeof isMath !== "undefined" &&
          isNumber(difficulty) &&
          typeof topic === "string"
        ) {
          // this should actually do some fetching here
          queryEntries(
            "skill",
            String(topic).trim(),
            "scoreBand",
            Number(difficulty),
            process.env.SECONDARY_DATABASE
          ).then((questions: any[]) => {
            if (Array.isArray(questions) && questions.length > 0) {
              // filter by difficulty
              let notFoundYet = true;
              let qChosen: Question | undefined = undefined;
            
              while (notFoundYet || qChosen === undefined) {
                let randomNum = Math.floor(Math.random() * questions.length);
                if (ourList.includes(questions[randomNum].skill.trim())) {
                  qChosen = questions[randomNum];
                  notFoundYet = false;
                }
              }
              // const questionChosen = questions[Math.floor(Math.random()*questions.length)];
              console.log("question chosen", qChosen);
              currentUser.question = qChosen
              resolve(qChosen);

              // res.status(200).send(craftRequest(200, {
              //     question: qChosen
              // }));
            } else {
              resolve({});
              // res.status(400).send(craftRequest(400, {question: {}}));
            }
          });
        } else {
          throw new Error(
            "there is something fundamentally wrong with this lobby."
          );
        }
      } catch (e) {
        console.log("this would be an error", e);
        throw new Error("Something is wrong here: " + e);
      }
    });

    // we will just use the gameSettings here.
  }

  // The main game loop on the server
  private update() {
    const deltaTime = this.TICK_RATE / 1000; // Delta time in seconds


    if (this.playerTwoConnection === "AI") {
      // this means it's a bot;
      this.updateBot(deltaTime);
    }

    // Update every character
    this.allCharacters.forEach((char) => {
      char.update(deltaTime, this.allCharacters);
    });
    // Remove dead characters
    const newCharacters = []
    for (let i=0; i<this.allCharacters.length;i++) {
      const char = this.allCharacters[i]


      if (char.health > 0) {
        newCharacters.push(char);
      } else {

        if (char.type === "tower") {

          const isPlayerOne = char.ownerId===this.playerOneStats.playerId ? true : false;

          if (isPlayerOne) {
            this.playerOneStats.towersRemaining -= 1;
          } else {
            this.playerTwoStats.towersRemaining -= 1;
          }



        } else {
          continue;
        }

      }
     
      
    }
    if (this.playerOneStats.towersRemaining === 0 || this.playerTwoStats.towersRemaining === 0) {
      this.handleWinCondition();
    }


    this.allCharacters = newCharacters
    // console.log("This is the tower situation", this.playerOneStats.towersRemaining, this.playerTwoStats.towersRemaining);
    this.updateCoconutAmounts(deltaTime);

    // update coconut amounts

    // Check for win/loss conditions...
    // console.log("these are all the characters", this.allCharacters)
    // Broadcast the new state to both players
    this.broadcastState();
  }

  private async handleWinCondition() {
    const playerOneWon = this.playerTwoStats.towersRemaining === 0 ? true : false
    // this will update the trophies of each person accordingly;

    // instead of elo, lets just make it fixed + a math.random() people won't know the difference.

    if (!playerOneWon&&this.playerTwoStats.playerId==="abcd") {
      // this means the AI won;
      // don't update the guy
      // do nothing i guess?
    } else {
      // this means a real player one
      const idOfGuy = playerOneWon ? this.playerOneStats.playerId : this.playerTwoStats.playerId
      await locateEntry("uuid", idOfGuy).then(async(u: LocateEntryEntry) => {
        if (u !== ""&&!Array.isArray(u)) {
          const user = u as User;
          await updateEntry("uuid", playerOneWon ? this.playerOneStats.playerId : this.playerTwoStats.playerId, {
            trophies: user.trophies ? user.trophies + Math.floor(Math.random()*4 + 25) : Math.floor(Math.random()*4 + 25)
          })
        } else {
          // do nothing, invalid game!
        }

      })
    }
    const broadcastEvent = {
      type: "WIN_CONDITION",
    }
    this.playerOneConnection.send(JSON.stringify({...broadcastEvent, 
      hasWon: playerOneWon
    }))


    if (typeof this.playerTwoConnection !== "string") {
      this.playerTwoConnection.send(JSON.stringify({...broadcastEvent, 
        hasWon: !playerOneWon
      }))
    
      
    }


    this.handleLobbyClose();

    



  }

  private handleLobbyClose() {
    // close connections
    // reset any lobby issues;
    // if someone disconnects, you instantly win

    if (typeof this.playerTwoConnection !== "string") {
      this.playerTwoConnection.close();
    }
    this.playerOneConnection.close();

    if (this.gameLoop !== null)
    clearInterval(this.gameLoop)


    allLobbies.delete(this.gameId)






  }

  // Method to handle a player's action
  public handlePlaceCharacter(
    playerId: string,
    cardName: string,
    position: { x: number; y: number }
  ) {
     const isPlayerOne = this.playerOneConnection.user.uuid === playerId;
    const playerStats = isPlayerOne ? this.playerOneStats : this.playerTwoStats;
    const card = playerStats.deck.find((c: any) => c.name === cardName);

    // playerOne will always be on the bottom, playerTwo on the top.

   

    if (card?.type !== "spell") {
      if (isPlayerOne && position.y < WORLD_HEIGHT / 2) {
        // Player 1 tried to place in the top half
        console.log("Invalid move: Player 1 cannot place in the top half.");
        return;
      }
      if (!isPlayerOne && position.y > WORLD_HEIGHT / 2) {
        // Player 2 tried to place in the bottom half
        console.log("Invalid move: Player 2 cannot place in the bottom half.");
        return;
      }

      // This assumes your client sends absolute world coordinates (e.g., P2 clicks at y=300).
      // If your client *always* sends coordinates as if it were P1 (e.g., 0-900),
      // then you need to flip P2's y-position here.
      // if (!isPlayerOne) {
      //     position.y = WORLD_HEIGHT - position.y;
      // }
    }

    if (!card || playerStats.coconuts < card.cost) {
      console.log("Invalid move: Not enough coconuts or card not found.");
      return; // Invalid action
    }

    playerStats.coconuts -= card.cost;

    const isOpponent = this.playerOneConnection.user.uuid !== playerId;
    const newChar = new Character(
      card,
      playerId,
      new Vec2(position.x, position.y)
    );
    this.allCharacters.push(newChar);
  }

  // Send the current state to the clients
  private broadcastState() {
    const statePayload = {
      type: "GAME_STATE_UPDATE",
      characters: this.allCharacters.map((char) => ({
        id: char.id,
        name: char.name,
        pos: char.pos,
        health: char.health,
        maxHealth: char.maxHealth,
        vel: char.vel,
        type: char.type,
        ownerId: char.ownerId,
        animation: char.animation,
        isBackwards: char.isBackwards,

        // Add any other data the client needs for rendering (e.g., isAttacking)
      })),
      // Include player stats like coconut counts
    };

    // console.log(statePayload);

    // const payloadString = JSON.stringify(statePayload);

    // console.log("this is what we sent back the player", payloadString);
    this.playerOneConnection.send(
      JSON.stringify({
        ...statePayload,
        coconuts: this.playerOneStats.coconuts,
      })
    );

    if (typeof this.playerTwoConnection !== "string") {
      // console.log("we are sending to player two")
      this.playerTwoConnection.send(
        JSON.stringify({
          ...statePayload,
          coconuts: this.playerTwoStats.coconuts,
        })
      );
    }
  }
}

const activeGames = new Map<string, GameState>();

export default function startWebsocket(server: Server) {
  type ConnectionState = "IN-GAME" | "LOCATING-GAME";

  type GameRequest = {
    type: "PLACE_CHARACTER" | "ANSWER_QUESTION";
    cardName?: string;
    position?: Vec2;
    answer?: string;
  };

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    console.log("parsing session from upgrade request");

    sessionMiddleware(request as any, {} as any, () => {
      console.log("session object after middleware", (request as any).session);
      const user = (request as any).session.passport?.user;
      // console.log("this was the full request", request)
      console.log("this is what user is", user);
      if (!user) {
        console.log(
          "WebSocket authentication failed: No user found in session."
        );
        // 3a. If no user, destroy the socket and abort
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log(`WebSocket authentication successful for user: ${user}`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Pass the request (with the user object) to the connection handler
        wss.emit("connection", ws, request);
      });
    });
  });
  wss.on(
    "connection",
    function connnection(ws: AuthenticatedWebSocket, request: IncomingMessage) {
      let connection_state: ConnectionState = "LOCATING-GAME";

      // console.log("this is the emit ws.user", (request as any).session.passport?.user)
      ws.user = (request as any).session.passport?.user;

      ws.on("message", async (data) => {
        try {
          if (connection_state === "LOCATING-GAME") {
            // console.log("the following user made a request:", ws.user);
            const request: string = data.toString();

            // console.log("received a message in request", request)
            const wasSuccessful = checkVacancy(request, ws);
            if (wasSuccessful) {
              console.log("we are in here");

              const lobby = allLobbies.get(request);
              if (lobby === null) {
                console.log("not valid dumbass");
                ws.send(
                  JSON.stringify({
                    status: "err",
                    message: "not valid gameId",
                  })
                );

                return;
              }
              // This promise logic is fine
              const pro = new Promise((resolve) => {
                let i = 0;
                const interval = setInterval(() => {
                  console.log("we are in the interval");
                  if (lobby.players.length === 2 || lobby.isFull) {
                    clearInterval(interval);
                    resolve("");
                  } else if (i > 4) {
                    console.log("we are calling fillWIthBot");
                    fillWithBot(request);
                    clearInterval(interval);
                    resolve("");
                  }
                  i++;
                }, 1000);
              });

              await pro;

              // --- START: RACE CONDITION FIX ---
              const finalLobby = allLobbies.get(request);
              // Check if the *other* connection already created the game
              if (finalLobby.gameId) {
                ws.gameId = finalLobby.gameId;
                connection_state = "IN-GAME";
                console.log(
                  `[Game Join] Player ${ws.user.uuid} joining existing game: ${ws.gameId}`
                );
                return; // We're done, we just needed to join
              }
              // If we're here, we are the *first* connection to arrive.
              // We will create the game.

              console.log(
                `[Game Create] Player ${ws.user.uuid} is creating the game...`
              );
              const playerOneConn = finalLobby
                .players[0] as AuthenticatedWebSocket;
              const playerTwoConn = finalLobby.players[1]; // Can be string or WS
              const playerOneId = playerOneConn.user.uuid;
              const playerTwoId =
                typeof playerTwoConn !== "string"
                  ? (playerTwoConn as AuthenticatedWebSocket).user.uuid
                  : "abcd"; // Bot ID
              const newGame = new GameState(
                playerOneConn,
                playerTwoConn,
                playerOneId,
                playerTwoId
              );

              // Set the lock
              finalLobby.gameId = newGame.gameId;
              allLobbies.set(request, finalLobby); // Save the lobby

              // Set the gameId on *both* connections
              playerOneConn.gameId = newGame.gameId;
              if (typeof playerTwoConn !== "string") {
                (playerTwoConn as AuthenticatedWebSocket).gameId =
                  newGame.gameId;
              }
              // Now start the game and notify players
              // websocketToGame[String(playerOneConn.user.uuid)] = newGame;
              // websocketToGame[String(playerTwoConn.user.uuid)] = newGame;
              activeGames.set(newGame.gameId, newGame);
              newGame.startGame();
              console.log("the game has been started");
              const gameStartPayload = {
                type: "GAME_START",
                gameId: newGame.gameId,
              };



              await new Promise(r => setTimeout(r, 1000));
              if (typeof playerTwoConn !== "string") {
                (playerTwoConn as AuthenticatedWebSocket).send(
                  JSON.stringify({ ...gameStartPayload, playerId: playerTwoId })
                );
                playerTwoConn.send(JSON.stringify({
                type: "NEW_QUESTION", 
                question: newGame.playerTwoStats.question,
                wasRight: false,
              }))
              }
              playerOneConn.send(
                JSON.stringify({ ...gameStartPayload, playerId: playerOneId })
              );
              
              playerOneConn.send(JSON.stringify({
                type: "NEW_QUESTION", 
                question: newGame.playerOneStats.question,
                wasRight: false,
              }))
            
              console.log("we sent stuff back");
              connection_state = "IN-GAME";
              // --- END: RACE CONDITION FIX ---
            } else {
              ws.send(
                JSON.stringify({
                  status: "err",
                  message: "not open",
                })
              );
            }
          } else if (connection_state === "IN-GAME") {
            const request: GameRequest = JSON.parse(data.toString());

            const game = activeGames.get(ws.gameId ?? "");

            //  bro. we need to normalize the position

            if (
              game &&
              request.type === "PLACE_CHARACTER" &&
              request.cardName &&
              request.position
            ) {
              game.handlePlaceCharacter(
                ws.user.uuid,
                request.cardName,
                request.position
              );

            } else if (request.type === "ANSWER_QUESTION") {
              console.log("we just called the answer Question func")
              const question: any = await game?.checkAnswer(ws.user.uuid, request.answer ?? "");
              console.log("we got back this from the checkAnswer func", question);
              ws.send(JSON.stringify({
                type: "NEW_QUESTION", 
                question: question,
                wasRight: question.wasRight,
              }))
            }
          }
        } catch (e) {
          console.error("Error processing message:", e);
          ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        // connection_state = 'CLOSED';
        console.log(`User ${ws.user} disconnected.`);
        // Handle cleanup logic here
      });
    }
  );
}
