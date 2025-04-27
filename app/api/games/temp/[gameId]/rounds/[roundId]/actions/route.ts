import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { dealCommunityCards, evaluateHand, determineWinner, Card } from '@/app/lib/poker';

type RouteParams = {
  params: {
    gameId: string;
    roundId: string;
  };
};

interface PlayerType {
  id: string;
  [key: string]: any;
}

// Texas Hold'em game stages
const ROUND_STATUSES = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN', 'FINISHED'];

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { gameId, roundId } = params;

    // First check if the game and round exist
    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const round = await prisma.round.findUnique({
      where: { 
        id: roundId,
        gameId,
      },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
        playerHands: {
          select: {
            userId: true,
            cards: true,
            folded: true,
            showedCards: true,
          },
        },
      },
    });

    if (!round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    return NextResponse.json(round, { status: 200 });
  } catch (error) {
    console.error('Error fetching actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch actions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { gameId, roundId } = params;
    const { userId, type, amount } = await request.json();

    // Validate required fields
    if (!userId || !type) {
      return NextResponse.json(
        { error: 'User ID and action type are required' },
        { status: 400 }
      );
    }

    // Validate action type
    const validTypes = ['FOLD', 'CHECK', 'CALL', 'BET', 'RAISE', 'ALL_IN'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid action type' },
        { status: 400 }
      );
    }

    // Check if the game is active
    const game = await prisma.game.findUnique({
      where: { 
        id: gameId,
        status: 'ACTIVE',
      },
      include: {
        players: true,
      },
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found or not active' },
        { status: 404 }
      );
    }

    // Check if the round exists and is active
    const round = await prisma.round.findUnique({
      where: { 
        id: roundId,
        gameId,
      },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
        playerHands: true,
      },
    });

    if (!round) {
      return NextResponse.json(
        { error: 'Round not found' },
        { status: 404 }
      );
    }

    if (round.status === 'FINISHED') {
      return NextResponse.json(
        { error: 'Round is already finished' },
        { status: 400 }
      );
    }

    // Check if user is part of the game
    const isPlayerInGame = game.players.some((player: PlayerType) => player.id === userId);
    if (!isPlayerInGame) {
      return NextResponse.json(
        { error: 'User is not a player in this game' },
        { status: 403 }
      );
    }

    // Check if it's this player's turn
    const playerPosition = await determinePlayerPosition(round, userId, game.players);
    if (playerPosition === -1) {
      return NextResponse.json(
        { error: 'Not your turn to act' },
        { status: 400 }
      );
    }

    // Get player's hand
    const playerHand = round.playerHands.find(hand => hand.userId === userId);
    if (!playerHand) {
      return NextResponse.json(
        { error: 'Player hand not found' },
        { status: 404 }
      );
    }

    // Can't act if folded
    if (playerHand.folded) {
      return NextResponse.json(
        { error: 'You have already folded' },
        { status: 400 }
      );
    }

    // Get player's current chip count
    const player = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!player) {
      return NextResponse.json(
        { error: 'Player not found' },
        { status: 404 }
      );
    }

    // Handle the action based on type
    let actionResponse;
    switch (type) {
      case 'FOLD':
        actionResponse = await handleFold(round, playerHand, playerPosition);
        break;
      case 'CHECK':
        // Can only check if no one has bet or you've already matched the bet
        if (canCheck(round, userId)) {
          actionResponse = await handleCheck(round, playerPosition);
        } else {
          return NextResponse.json(
            { error: 'Cannot check, you must call, raise, or fold' },
            { status: 400 }
          );
        }
        break;
      case 'CALL':
        // Need to match the current bet
        actionResponse = await handleCall(round, player, playerPosition);
        break;
      case 'BET':
        // Can only bet if no one else has bet in this round
        if (canBet(round)) {
          if (!amount || amount <= 0) {
            return NextResponse.json(
              { error: 'Bet amount must be greater than 0' },
              { status: 400 }
            );
          }
          if (amount > player.chips) {
            return NextResponse.json(
              { error: 'Cannot bet more than your chip count' },
              { status: 400 }
            );
          }
          actionResponse = await handleBet(round, player, amount, playerPosition);
        } else {
          return NextResponse.json(
            { error: 'Cannot bet, you must call, raise, or fold' },
            { status: 400 }
          );
        }
        break;
      case 'RAISE':
        // Can only raise if someone has already bet
        if (canRaise(round)) {
          if (!amount || amount <= round.currentBet) {
            return NextResponse.json(
              { error: 'Raise amount must be greater than the current bet' },
              { status: 400 }
            );
          }
          if (amount > player.chips) {
            return NextResponse.json(
              { error: 'Cannot raise more than your chip count' },
              { status: 400 }
            );
          }
          actionResponse = await handleRaise(round, player, amount, playerPosition);
        } else {
          return NextResponse.json(
            { error: 'Cannot raise, you must bet, call, or fold' },
            { status: 400 }
          );
        }
        break;
      case 'ALL_IN':
        actionResponse = await handleAllIn(round, player, playerPosition);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action type' },
          { status: 400 }
        );
    }

    // After the action, check if the betting round is complete
    const isRoundComplete = await checkRoundCompletion(round.id, game.players.length);
    
    if (isRoundComplete) {
      // Move to next stage of the round or end the round
      const updatedRound = await moveToNextStage(round, game);
      actionResponse.roundStatus = updatedRound.status;
      
      // If the round is now FINISHED, handle the pot distribution
      if (updatedRound.status === 'FINISHED') {
        const winnerInfo = await determineRoundWinner(updatedRound.id, gameId);
        actionResponse.winner = winnerInfo;
      }
    }

    return NextResponse.json(actionResponse, { status: 200 });
  } catch (error) {
    console.error('Error processing action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}

// Helper functions

// Determine player position and if it's their turn
async function determinePlayerPosition(
  round: any,
  userId: string,
  players: PlayerType[]
): Promise<number> {
  // Get the most recent action
  const lastAction = round.actions[round.actions.length - 1];
  
  // If no actions yet, start with player after big blind
  if (!lastAction) {
    // In preflop, the first player is after the big blind
    // In this case, we need to find the dealer position and calculate from there
    const dealerPosition = round.dealerPosition;
    const bigBlindPos = (dealerPosition + 2) % players.length;
    const firstToActPos = (bigBlindPos + 1) % players.length;
    
    // Check if this is the player who should act first
    return players[firstToActPos].id === userId ? firstToActPos : -1;
  }
  
  // Find the player who acted last
  const lastActorPosition = lastAction.position;
  const nextPosition = (lastActorPosition + 1) % players.length;
  
  // Check if this player's hand is still active (not folded)
  const allHands = await prisma.playerHand.findMany({
    where: { roundId: round.id },
  });
  
  // Find the next active player
  let currentPos = nextPosition;
  let loopCount = 0;
  
  while (loopCount < players.length) {
    const currentPlayerId = players[currentPos].id;
    const hand = allHands.find(h => h.userId === currentPlayerId);
    
    if (hand && !hand.folded && currentPlayerId === userId) {
      return currentPos;
    }
    
    // Player folded or not the user - move to next
    if (hand && hand.folded) {
      currentPos = (currentPos + 1) % players.length;
    } else if (currentPlayerId !== userId) {
      currentPos = (currentPos + 1) % players.length;
    }
    
    loopCount++;
  }
  
  return -1; // Not this player's turn
}

// Check if the betting round is complete
async function checkRoundCompletion(roundId: string, playerCount: number): Promise<boolean> {
  const actions = await prisma.action.findMany({
    where: { roundId },
    orderBy: { createdAt: 'asc' },
  });
  
  const hands = await prisma.playerHand.findMany({
    where: { roundId },
  });
  
  // Count active players (those who haven't folded)
  const activePlayers = hands.filter(h => !h.folded).length;
  
  // If only one player remains, the round is complete
  if (activePlayers === 1) {
    return true;
  }
  
  // Check if all active players have acted at least once
  const uniqueActors = new Set(actions.map(a => a.userId));
  const activePlayed = [...uniqueActors].filter(userId => 
    !hands.find(h => h.userId === userId)?.folded
  );
  
  if (activePlayed.length < activePlayers) {
    return false;
  }
  
  // Check if all active players have acted since the last bet/raise
  let lastBetIndex = -1;
  
  for (let i = actions.length - 1; i >= 0; i--) {
    if (['BET', 'RAISE', 'ALL_IN'].includes(actions[i].type)) {
      lastBetIndex = i;
      break;
    }
  }
  
  // If no bet/raise, check if all active players have acted
  if (lastBetIndex === -1) {
    return activePlayed.length === activePlayers;
  }
  
  // Check if all active players have acted after the last bet/raise
  const actionsAfterBet = actions.slice(lastBetIndex + 1);
  const playersWhoActedAfterBet = new Set(actionsAfterBet.map(a => a.userId));
  
  // The player who made the last bet/raise doesn't need to act again
  const playerWhoBet = actions[lastBetIndex].userId;
  playersWhoActedAfterBet.add(playerWhoBet);
  
  // Count active players who have acted after the last bet
  const activePlayersWhoActed = [...playersWhoActedAfterBet].filter(userId => 
    !hands.find(h => h.userId === userId)?.folded
  );
  
  return activePlayersWhoActed.length === activePlayers;
}

// Move to the next stage of the round
async function moveToNextStage(round: any, game: any): Promise<any> {
  const currentStatus = round.status;
  const currentIndex = ROUND_STATUSES.indexOf(currentStatus);
  
  if (currentIndex === -1 || currentIndex === ROUND_STATUSES.length - 1) {
    // Already at the end or invalid status
    return round;
  }
  
  // Get current community cards if any
  let communityCards: Card[] = [];
  if (round.communityCards) {
    communityCards = JSON.parse(round.communityCards);
  }
  
  // Create a pseudo-deck for demonstration purposes
  // In a real app, you'd maintain the deck state or generate cards more carefully
  const remainingCards = generateRemainingCards(communityCards, round.playerHands);
  
  // Determine next status and update accordingly
  const nextStatus = ROUND_STATUSES[currentIndex + 1];
  let newCommunityCards = communityCards;
  
  // Handle different stage transitions
  switch (nextStatus) {
    case 'FLOP':
      // Deal 3 cards for the flop
      const flopResult = dealCommunityCards(remainingCards, 3);
      newCommunityCards = flopResult.communityCards;
      break;
    case 'TURN':
      // Deal 1 card for the turn
      const turnResult = dealCommunityCards(remainingCards, 1);
      newCommunityCards = [...communityCards, ...turnResult.communityCards];
      break;
    case 'RIVER':
      // Deal 1 card for the river
      const riverResult = dealCommunityCards(remainingCards, 1);
      newCommunityCards = [...communityCards, ...riverResult.communityCards];
      break;
    case 'SHOWDOWN':
      // No new cards, just show cards and determine winner
      break;
    case 'FINISHED':
      // Round is complete
      break;
  }
  
  // Update the round with new status and cards
  const updatedRound = await prisma.round.update({
    where: { id: round.id },
    data: {
      status: nextStatus,
      communityCards: newCommunityCards.length > 0 ? JSON.stringify(newCommunityCards) : null,
      currentBet: 0, // Reset the current bet for the new stage
    },
    include: {
      playerHands: true,
    },
  });
  
  return updatedRound;
}

// Generate remaining cards for demonstration
function generateRemainingCards(communityCards: Card[], playerHands: any[]): Card[] {
  // In a real implementation, you'd track the deck from the start of the game
  // This is a simplified implementation for demonstration
  const deck: Card[] = [
    '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH', 'JH', 'QH', 'KH', 'AH',
    '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', 'TD', 'JD', 'QD', 'KD', 'AD',
    '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC', 'JC', 'QC', 'KC', 'AC',
    '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'AS'
  ] as Card[];
  
  // Remove cards already in use
  const usedCards = [...communityCards];
  
  // Add player cards
  playerHands.forEach(hand => {
    const cards = JSON.parse(hand.cards);
    usedCards.push(...cards);
  });
  
  // Filter out used cards
  return deck.filter(card => !usedCards.includes(card));
}

// Determine the winner of the round
async function determineRoundWinner(roundId: string, gameId: string): Promise<any> {
  // Get the round with player hands and community cards
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      playerHands: true,
    },
  });
  
  if (!round) {
    throw new Error('Round not found');
  }
  
  // Parse community cards
  const communityCards = round.communityCards ? JSON.parse(round.communityCards) as Card[] : [];
  
  // Format player hands for the winner determination
  const playerHandsForEvaluation = round.playerHands.map(hand => ({
    userId: hand.userId,
    cards: JSON.parse(hand.cards) as Card[],
    folded: hand.folded,
  }));
  
  // Determine the winner
  const winner = determineWinner(playerHandsForEvaluation, communityCards);
  
  if (!winner) {
    // No winner (shouldn't happen unless all folded)
    return null;
  }
  
  // Update the winner's hand with rank information
  await prisma.playerHand.updateMany({
    where: {
      roundId,
      userId: winner.winnerId,
    },
    data: {
      finalHandRank: winner.winningHand.rank,
      finalHandDesc: winner.winningHand.description,
      showedCards: true,
    },
  });
  
  // Award pot to winner
  await prisma.user.update({
    where: { id: winner.winnerId },
    data: {
      chips: {
        increment: round.pot,
      },
    },
  });
  
  // Get the winner's info
  const winnerUser = await prisma.user.findUnique({
    where: { id: winner.winnerId },
    select: {
      id: true,
      name: true,
      chips: true,
    },
  });
  
  return {
    winner: winnerUser,
    handRank: winner.winningHand.rank,
    handDescription: winner.winningHand.description,
    bestHand: winner.winningHand.bestHand,
    pot: round.pot,
  };
}

// Action handler functions
async function handleFold(round: any, playerHand: any, position: number): Promise<any> {
  // Mark the player's hand as folded
  await prisma.playerHand.update({
    where: {
      id: playerHand.id,
    },
    data: {
      folded: true,
    },
  });
  
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: playerHand.userId,
      type: 'FOLD',
      amount: 0,
      position,
    },
  });
  
  return {
    action,
    message: 'Successfully folded',
  };
}

async function handleCheck(round: any, position: number): Promise<any> {
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: round.playerHands.find((h: any) => h.userId === position).userId,
      type: 'CHECK',
      amount: 0,
      position,
    },
  });
  
  return {
    action,
    message: 'Successfully checked',
  };
}

async function handleCall(round: any, player: any, position: number): Promise<any> {
  // Calculate how much the player needs to call
  const lastBet = round.currentBet;
  
  // Get the player's total contribution to the current round
  const playerActions = await prisma.action.findMany({
    where: {
      roundId: round.id,
      userId: player.id,
    },
  });
  
  const totalContributed = playerActions.reduce((sum, action) => sum + action.amount, 0);
  const amountToCall = lastBet - totalContributed;
  
  if (amountToCall <= 0) {
    return {
      error: 'Nothing to call, you can check instead',
      status: 400,
    };
  }
  
  if (amountToCall > player.chips) {
    return {
      error: 'Not enough chips to call',
      status: 400,
    };
  }
  
  // Update the player's chips
  await prisma.user.update({
    where: { id: player.id },
    data: {
      chips: {
        decrement: amountToCall,
      },
    },
  });
  
  // Update the pot
  await prisma.round.update({
    where: { id: round.id },
    data: {
      pot: {
        increment: amountToCall,
      },
    },
  });
  
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: player.id,
      type: 'CALL',
      amount: amountToCall,
      position,
    },
  });
  
  return {
    action,
    message: `Successfully called ${amountToCall}`,
    potTotal: round.pot + amountToCall,
  };
}

async function handleBet(round: any, player: any, amount: number, position: number): Promise<any> {
  // Check if player has enough chips
  if (amount > player.chips) {
    return {
      error: 'Not enough chips to bet',
      status: 400,
    };
  }
  
  // Update the player's chips
  await prisma.user.update({
    where: { id: player.id },
    data: {
      chips: {
        decrement: amount,
      },
    },
  });
  
  // Update the round
  await prisma.round.update({
    where: { id: round.id },
    data: {
      pot: {
        increment: amount,
      },
      currentBet: amount,
    },
  });
  
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: player.id,
      type: 'BET',
      amount,
      position,
    },
  });
  
  return {
    action,
    message: `Successfully bet ${amount}`,
    potTotal: round.pot + amount,
  };
}

async function handleRaise(round: any, player: any, amount: number, position: number): Promise<any> {
  // Check if amount is greater than current bet
  if (amount <= round.currentBet) {
    return {
      error: 'Raise amount must be greater than current bet',
      status: 400,
    };
  }
  
  // Calculate the additional amount the player needs to put in
  const playerActions = await prisma.action.findMany({
    where: {
      roundId: round.id,
      userId: player.id,
    },
  });
  
  const totalContributed = playerActions.reduce((sum, action) => sum + action.amount, 0);
  const amountToRaise = amount - totalContributed;
  
  // Check if player has enough chips
  if (amountToRaise > player.chips) {
    return {
      error: 'Not enough chips to raise',
      status: 400,
    };
  }
  
  // Update the player's chips
  await prisma.user.update({
    where: { id: player.id },
    data: {
      chips: {
        decrement: amountToRaise,
      },
    },
  });
  
  // Update the round
  await prisma.round.update({
    where: { id: round.id },
    data: {
      pot: {
        increment: amountToRaise,
      },
      currentBet: amount,
    },
  });
  
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: player.id,
      type: 'RAISE',
      amount: amountToRaise,
      position,
    },
  });
  
  return {
    action,
    message: `Successfully raised to ${amount}`,
    potTotal: round.pot + amountToRaise,
  };
}

async function handleAllIn(round: any, player: any, position: number): Promise<any> {
  const chipCount = player.chips;
  
  if (chipCount <= 0) {
    return {
      error: 'No chips to go all-in with',
      status: 400,
    };
  }
  
  // Update the player's chips to zero
  await prisma.user.update({
    where: { id: player.id },
    data: {
      chips: 0,
    },
  });
  
  // Update the round
  const updatedRound = await prisma.round.update({
    where: { id: round.id },
    data: {
      pot: {
        increment: chipCount,
      },
      currentBet: {
        set: Math.max(round.currentBet, chipCount),
      },
    },
  });
  
  // Record the action
  const action = await prisma.action.create({
    data: {
      roundId: round.id,
      userId: player.id,
      type: 'ALL_IN',
      amount: chipCount,
      position,
    },
  });
  
  return {
    action,
    message: `Successfully went all-in for ${chipCount}`,
    potTotal: updatedRound.pot,
  };
}

// Helper functions for action validation
function canCheck(round: any, userId: string): boolean {
  // Can check if no bets have been made or if the player has already matched the current bet
  if (round.currentBet === 0) {
    return true;
  }
  
  // Get player's contribution
  const playerContributions = round.actions
    .filter((a: any) => a.userId === userId)
    .reduce((total: number, action: any) => total + action.amount, 0);
  
  return playerContributions >= round.currentBet;
}

function canBet(round: any): boolean {
  // Can only bet if no bets have been made in this round
  return round.currentBet === 0;
}

function canRaise(round: any): boolean {
  // Can only raise if a bet has already been made
  return round.currentBet > 0;
} 