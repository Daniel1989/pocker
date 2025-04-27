import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

type RouteParams = {
  params: {
    gameId: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { gameId } = params;

    // First check if the game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Fetch all rounds for this game
    const rounds = await prisma.round.findMany({
      where: { gameId },
      orderBy: { number: 'asc' },
      include: {
        actions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return NextResponse.json({ rounds }, { status: 200 });
  } catch (error) {
    console.error('Error fetching rounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rounds' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { gameId } = params;

    // First check if the game exists and is in the correct state
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        rounds: {
          orderBy: { number: 'desc' },
          take: 1,
        },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cannot add rounds to a game that is not active' },
        { status: 400 }
      );
    }

    // Check if all previous rounds are finished
    const hasUnfinishedRounds = await prisma.round.findFirst({
      where: {
        gameId,
        status: 'ACTIVE',
      },
    });

    if (hasUnfinishedRounds) {
      return NextResponse.json(
        { error: 'Cannot start a new round while another is active' },
        { status: 400 }
      );
    }

    // Calculate the round number
    const roundNumber = game.rounds.length > 0 
      ? game.rounds[0].number + 1 
      : 1;

    // Create the new round
    const round = await prisma.round.create({
      data: {
        gameId,
        number: roundNumber,
        status: 'ACTIVE',
      },
      include: {
        actions: true,
      },
    });

    return NextResponse.json(round, { status: 201 });
  } catch (error) {
    console.error('Error creating round:', error);
    return NextResponse.json(
      { error: 'Failed to create round' },
      { status: 500 }
    );
  }
} 