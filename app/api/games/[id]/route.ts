import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

type RouteParams = {
  params: {
    id: string;
  };
};

interface PlayerType {
  id: string;
  chips?: number;
  [key: string]: any;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    const game = await prisma.game.findUnique({
      where: { id },
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
        rounds: {
          orderBy: { number: 'desc' },
          take: 1,
          include: {
            playerHands: {
              select: {
                userId: true,
                cards: true,
                folded: true,
                showedCards: true,
                finalHandRank: true,
                finalHandDesc: true,
              },
            },
            actions: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json(game, { status: 200 });
  } catch (error) {
    console.error(`Error fetching game:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;
    const { status, addPlayerId } = await request.json();

    // Find the game first
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

    // Prepare update data
    const updateData: any = {};
    
    // Update status if provided
    if (status) {
      updateData.status = status;
    }

    // Perform the update
    const updatedGame = await prisma.game.update({
      where: { id },
      data: updateData,
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

    // If a player should be added
    if (addPlayerId) {
      // Check if player is not already in the game
      const playerExists = game.players.some((player: PlayerType) => player.id === addPlayerId);
      
      if (!playerExists) {
        // Check if there's space in the game
        if (game.players.length >= game.maxPlayers) {
          return NextResponse.json(
            { error: 'Game is full' },
            { status: 400 }
          );
        }

        // Check if player has enough chips for buy-in
        const player = await prisma.user.findUnique({
          where: { id: addPlayerId },
        });

        if (!player) {
          return NextResponse.json(
            { error: 'Player not found' },
            { status: 404 }
          );
        }

        if (player.chips < game.buyIn) {
          return NextResponse.json(
            { error: 'Player does not have enough chips for buy-in' },
            { status: 400 }
          );
        }

        // Add player to game
        await prisma.game.update({
          where: { id },
          data: {
            players: {
              connect: { id: addPlayerId },
            },
          },
        });

        // Deduct buy-in amount from player's chips
        await prisma.user.update({
          where: { id: addPlayerId },
          data: {
            chips: {
              decrement: game.buyIn
            }
          }
        });
      }
    }

    // Fetch the game again with the updated data
    const finalGame = await prisma.game.findUnique({
      where: { id },
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

    return NextResponse.json(finalGame, { status: 200 });
  } catch (error) {
    console.error(`Error updating game:`, error);
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        players: true,
      },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    // Return buy-in to players if game is still in WAITING state
    if (game.status === 'WAITING') {
      for (const player of game.players) {
        await prisma.user.update({
          where: { id: player.id },
          data: {
            chips: {
              increment: game.buyIn
            }
          }
        });
      }
    }

    // Delete all related data in a transaction
    await prisma.$transaction([
      // Delete player hands
      prisma.playerHand.deleteMany({
        where: {
          gameId: id,
        },
      }),
      // Delete actions from all rounds
      prisma.action.deleteMany({
        where: {
          round: {
            gameId: id,
          },
        },
      }),
      // Delete all rounds
      prisma.round.deleteMany({
        where: {
          gameId: id,
        },
      }),
      // Finally delete the game
      prisma.game.delete({
        where: { id },
      }),
    ]);

    return NextResponse.json({ message: 'Game deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting game:`, error);
    return NextResponse.json(
      { error: 'Failed to delete game' },
      { status: 500 }
    );
  }
} 