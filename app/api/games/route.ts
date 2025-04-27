import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

export async function GET() {
  try {
    const games = await prisma.game.findMany({
      include: {
        host: {
          select: {
            id: true,
            name: true,
          },
        },
        players: {
          select: {
            id: true,
            name: true,
            chips: true,
          },
        },
        _count: {
          select: { rounds: true },
        },
      },
    });

    return NextResponse.json({ games }, { status: 200 });
  } catch (error) {
    console.error('Error fetching games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name, hostId, blinds, maxPlayers, buyIn } = await request.json();

    // Validate required fields
    if (!name || !hostId) {
      return NextResponse.json(
        { error: 'Game name and host ID are required' },
        { status: 400 }
      );
    }

    // Check if host exists
    const host = await prisma.user.findUnique({
      where: { id: hostId },
    });

    if (!host) {
      return NextResponse.json(
        { error: 'Host user not found' },
        { status: 404 }
      );
    }

    // Check if host has enough chips for buy-in
    const gameBuyIn = buyIn || 100; // Default buy-in is 100
    if (host.chips < gameBuyIn) {
      return NextResponse.json(
        { error: 'Host does not have enough chips for buy-in' },
        { status: 400 }
      );
    }

    // Create the game with Texas Hold'em settings
    const game = await prisma.game.create({
      data: {
        name,
        hostId,
        blinds: blinds || '10/20', // Default blinds are 10/20
        maxPlayers: maxPlayers || 9, // Default max players is 9
        buyIn: gameBuyIn,
        players: {
          connect: { id: hostId }, // Host is also a player
        },
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
          },
        },
        players: {
          select: {
            id: true,
            name: true,
            chips: true,
          },
        },
      },
    });

    // Deduct buy-in amount from host's chips
    await prisma.user.update({
      where: { id: hostId },
      data: {
        chips: {
          decrement: gameBuyIn
        }
      }
    });

    return NextResponse.json(game, { status: 201 });
  } catch (error) {
    console.error('Error creating game:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
} 