import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get('gameId');
    const game = await prisma.game.findUnique({
      where: {
        id: gameId!,
      },
      include: {
        players: true,
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

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error fetching game:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const body = await request.json();
    const { status } = body;
    const url = new URL(request.url);
    const gameId = url.searchParams.get('gameId');
    const game = await prisma.game.update({
      where: {
        id: gameId!,
      },
      data: {
        status,
      },
      include: {
        players: true,
      },
    });

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error updating game:', error);
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get('gameId');
    await prisma.game.delete({
      where: {
        id: gameId!,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting game:', error);
    return NextResponse.json(
      { error: 'Failed to delete game' },
      { status: 500 }
    );
  }
} 