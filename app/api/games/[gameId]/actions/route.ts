import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Get all actions for a game
export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const actions = await prisma.gameAction.findMany({
      where: {
        gameId: params.gameId,
      },
      include: {
        player: true,
      },
      orderBy: {
        sequenceNumber: 'asc',
      },
    });

    return NextResponse.json(actions);
  } catch (error) {
    console.error('Error fetching game actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game actions' },
      { status: 500 }
    );
  }
}

// Create a new action
export async function POST(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const body = await request.json();
    const { playerId, actionType, amount, gameState } = body;

    // First, ensure the GamePlayer exists
    let player = await prisma.gamePlayer.findFirst({
      where: {
        AND: [
          { gameId: params.gameId },
          { playerId: playerId }
        ]
      }
    });

    // If player doesn't exist, create them
    if (!player) {
      const playerInfo = gameState.players.find((p: any) => p.id === playerId);
      if (!playerInfo) {
        return NextResponse.json(
          { error: 'Player information not found in game state' },
          { status: 400 }
        );
      }

      player = await prisma.gamePlayer.create({
        data: {
          gameId: params.gameId,
          playerId: playerId,
          name: playerInfo.name,
          position: playerInfo.position || 0,
          startingChips: playerInfo.chips,
        },
      });
    }

    // Get the latest sequence number for this game
    const latestAction = await prisma.gameAction.findFirst({
      where: { gameId: params.gameId },
      orderBy: { sequenceNumber: 'desc' },
    });

    const newSequenceNumber = (latestAction?.sequenceNumber ?? 0) + 1;

    // Create the action with the confirmed player
    const action = await prisma.gameAction.create({
      data: {
        gameId: params.gameId,
        playerId: player.id, // Use the GamePlayer's ID
        actionType,
        amount,
        gameState,
        sequenceNumber: newSequenceNumber,
      },
      include: {
        player: true,
      },
    });

    return NextResponse.json(action);
  } catch (error) {
    console.error('Error creating game action:', error);
    return NextResponse.json(
      { error: 'Failed to create game action' },
      { status: 500 }
    );
  }
} 