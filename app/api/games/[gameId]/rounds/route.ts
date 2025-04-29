import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const game = await prisma.game.findUnique({
      where: {
        id: params.gameId,
      },
      include: {
        actions: {
          include: {
            player: true,
          },
          orderBy: {
            sequenceNumber: 'asc',
          },
        },
      },
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Group actions by round (based on game state)
    const rounds = game.actions.reduce((acc: any[], action) => {
      const gameState = action.gameState as any;
      const lastRound = acc[acc.length - 1];
      
      if (!lastRound || lastRound.phase !== gameState.gamePhase) {
        acc.push({
          phase: gameState.gamePhase,
          actions: [action],
          pot: gameState.pot,
          communityCards: gameState.communityCards,
        });
      } else {
        lastRound.actions.push(action);
        lastRound.pot = gameState.pot;
        lastRound.communityCards = gameState.communityCards;
      }
      
      return acc;
    }, []);

    return NextResponse.json(rounds);
  } catch (error) {
    console.error('Error fetching game rounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game rounds' },
      { status: 500 }
    );
  }
} 