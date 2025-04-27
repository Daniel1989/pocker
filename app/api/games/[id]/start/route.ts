import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { dealCards, Card } from '@/app/lib/poker';

type RouteParams = {
  params: {
    id: string;
  };
};

interface PlayerType {
  id: string;
  [key: string]: any;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // Find the game
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        players: true,
        rounds: {
          orderBy: { number: 'desc' },
          take: 1,
        },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Check if game can be started
    if (game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is already started or finished' },
        { status: 400 }
      );
    }

    // Need at least 2 players to start
    if (game.players.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 players to start a game' },
        { status: 400 }
      );
    }

    // Parse blinds to get small blind and big blind
    const [smallBlind, bigBlind] = game.blinds.split('/').map(Number);
    
    // Determine initial dealer position randomly
    const dealerPosition = Math.floor(Math.random() * game.players.length);
    
    // Calculate small and big blind positions
    const smallBlindPosition = (dealerPosition + 1) % game.players.length;
    const bigBlindPosition = (dealerPosition + 2) % game.players.length;
    
    // Deal cards to players
    const { playerCards, remainingDeck } = dealCards(game.players.length);
    
    // Update game status to ACTIVE
    const updatedGame = await prisma.game.update({
      where: { id },
      data: {
        status: 'ACTIVE',
      },
    });
    
    // Create the first round
    const round = await prisma.round.create({
      data: {
        gameId: id,
        number: 1,
        status: 'PREFLOP',
        dealerPosition,
        pot: smallBlind + bigBlind, // Initial pot is sum of the blinds
        currentBet: bigBlind,
      },
    });
    
    // Record the small blind and big blind actions
    const smallBlindPlayer = game.players[smallBlindPosition];
    const bigBlindPlayer = game.players[bigBlindPosition];
    
    await prisma.action.create({
      data: {
        roundId: round.id,
        userId: smallBlindPlayer.id,
        type: 'BET',
        amount: smallBlind,
        position: smallBlindPosition,
      },
    });
    
    await prisma.action.create({
      data: {
        roundId: round.id,
        userId: bigBlindPlayer.id,
        type: 'BET',
        amount: bigBlind,
        position: bigBlindPosition,
      },
    });
    
    // Record player hands
    const playerHandPromises = game.players.map((player: PlayerType, index: number) => {
      const playerHand = playerCards[index];
      return prisma.playerHand.create({
        data: {
          userId: player.id,
          gameId: id,
          roundId: round.id,
          cards: JSON.stringify(playerHand),
        },
      });
    });
    
    await Promise.all(playerHandPromises);
    
    // Deduct blinds from players' chips
    await prisma.user.update({
      where: { id: smallBlindPlayer.id },
      data: {
        chips: {
          decrement: smallBlind,
        },
      },
    });
    
    await prisma.user.update({
      where: { id: bigBlindPlayer.id },
      data: {
        chips: {
          decrement: bigBlind,
        },
      },
    });
    
    // Get the updated game state with the initial round
    const finalGameState = await prisma.game.findUnique({
      where: { id },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            chips: true,
          },
        },
        rounds: {
          orderBy: { number: 'desc' },
          take: 1,
          include: {
            actions: {
              orderBy: { createdAt: 'asc' },
            },
            playerHands: {
              select: {
                userId: true,
                cards: true,
                folded: true,
              },
            },
          },
        },
      },
    });
    
    return NextResponse.json({
      message: 'Game started successfully',
      game: finalGameState,
      nextToAct: (bigBlindPosition + 1) % game.players.length, // Player after big blind acts first
    }, { status: 200 });
    
  } catch (error) {
    console.error('Error starting game:', error);
    return NextResponse.json(
      { error: 'Failed to start game' },
      { status: 500 }
    );
  }
} 