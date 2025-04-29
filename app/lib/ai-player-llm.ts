import { OpenAI } from 'openai';
import { evaluateHand } from './poker';
import { getHandStrength } from './poker-probability';
import { AILevel, GameState, makeAIDecision as makeAIDecisionFallback, PlayerState } from './ai-player';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface AIDecisionWithReason {
  action: string;
  amount?: number;
  reason: string;
}

// Evaluate pocket cards strength
function evaluatePocketCards(cards: string[]): string {
  if (cards.length !== 2) return '无效的起手牌';
  
  const card1 = cards[0];
  const card2 = cards[1];
  const value1 = card1[0];
  const value2 = card2[0];
  const suit1 = card1[1];
  const suit2 = card2[1];
  
  // Pair
  if (value1 === value2) {
    return `对子 ${value1}`;
  }
  
  // Suited cards
  const isSuited = suit1 === suit2;
  const suitedText = isSuited ? '同花' : '不同花';
  
  return `${value1}${value2} ${suitedText}`;
}

// Get card value rank description in Chinese
function getCardValueRankDescription(value: string): string {
  const rankMap: Record<string, string> = {
    'A': '王牌（A）',
    'K': '国王（K）',
    'Q': '皇后（Q）',
    'J': '杰克（J）',
    'T': '10',
    '9': '9',
    '8': '8',
    '7': '7',
    '6': '6',
    '5': '5',
    '4': '4',
    '3': '3',
    '2': '2'
  };
  return rankMap[value] || value;
}

// Determine bet size with explanation
function determineBetSizeWithReason(
  chips: number,
  pot: number,
  handStrength: number,
  phase: string
): { amount: number; reason: string } {
  let betRatio = 0.5;
  let reasons: string[] = [];
  
  // Adjust based on hand strength
  if (handStrength > 0.8) {
    betRatio += 0.3;
    reasons.push('手牌非常强，增加下注比例');
  } else if (handStrength > 0.6) {
    betRatio += 0.2;
    reasons.push('手牌较强，适度增加下注');
  } else if (handStrength < 0.3) {
    betRatio -= 0.2;
    reasons.push('手牌较弱，降低下注比例');
  }
  
  // Adjust based on game phase
  if (phase === 'RIVER') {
    betRatio += 0.2;
    reasons.push('河牌圈，增加下注施加压力');
  } else if (phase === 'TURN') {
    betRatio += 0.1;
    reasons.push('转牌圈，适度增加下注');
  }
  
  // Calculate bet amount
  let betAmount = Math.floor(pot * betRatio);
  betAmount = Math.max(betAmount, 20); // Minimum bet
  betAmount = Math.min(betAmount, chips); // Can't bet more than we have
  betAmount = Math.floor(betAmount / 5) * 5; // Round to nearest 5
  
  return {
    amount: betAmount,
    reason: `下注金额 ${betAmount} (${Math.round(betRatio * 100)}% 底池)。\n原因：${reasons.join('；')}`
  };
}

export async function makeAIDecision(
  aiPlayer: PlayerState,
  gameState: GameState,
  personality: any
): Promise<AIDecisionWithReason> {
  try {
    // 1. Evaluate hand strength
    const handStrength = getHandStrength(aiPlayer.cards || [], gameState.communityCards);
    
    // 2. Evaluate pocket cards
    const pocketCardsEvaluation = evaluatePocketCards(aiPlayer.cards || []);
    
    // 3. Get card values
    const cardValues = (aiPlayer.cards || []).map(card => getCardValueRankDescription(card[0]));
    
    // Prepare game state description for OpenAI
    const prompt = `
作为一个德州扑克AI玩家，请基于以下信息做出决策。必须以JSON格式返回，包含action和reason两个字段。

当前手牌信息：
- 手牌：${cardValues.join(', ')}
- 手牌类型：${pocketCardsEvaluation}
- 手牌强度：${Math.round(handStrength * 100)}%

游戏状态：
- 当前阶段：${gameState.phase}
- 底池：${gameState.pot}
- 当前下注：${gameState.currentBet}
- 玩家筹码：${aiPlayer.chips}
- 公共牌：${gameState.communityCards.length > 0 ? gameState.communityCards.join(', ') : '无'}

请分析形势并返回如下格式的JSON：
{
  "action": "FOLD|CHECK|CALL|RAISE|ALL_IN",
  "reason": "详细的中文分析理由"
}
`;

    // Get AI's analysis
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "你是一个专业的德州扑克AI助手。你必须返回一个包含action和reason字段的JSON对象。Action必须是以下之一：FOLD, CHECK, CALL, RAISE, ALL_IN。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" }
    });

    let aiResponse: { action: string; reason: string };
    try {
      const responseContent = completion.choices[0].message.content || '{}';
      aiResponse = JSON.parse(responseContent);
      
      if (!aiResponse.action || !aiResponse.reason || 
          !['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN'].includes(aiResponse.action)) {
        throw new Error('Invalid AI response format');
      }
    } catch (error) {
      console.log('Failed to parse OpenAI response, using fallback AI');
      const fallbackDecision = makeAIDecisionFallback(aiPlayer, gameState, {
        level: AILevel.MEDIUM,
        bluffFrequency: 0.3,
        riskTolerance: 0.5,
        aggressiveness: 0.5
      });
      return { ...fallbackDecision, reason: '使用备用AI系统做出决策' };
    }

    // Determine action and amount based on AI's decision
    let amount: number | undefined;

    if (aiResponse.action === 'RAISE') {
      const betDecision = determineBetSizeWithReason(
        aiPlayer.chips,
        gameState.pot,
        handStrength,
        gameState.phase
      );
      amount = betDecision.amount;
      aiResponse.reason += '\n' + betDecision.reason;
    } else if (aiResponse.action === 'CALL') {
      amount = gameState.currentBet - 0;
    }

    return {
      action: aiResponse.action,
      amount,
      reason: aiResponse.reason
    };
  } catch (error) {
    console.error('OpenAI decision error:', error);
    // Fallback to traditional AI
    const fallbackDecision = makeAIDecisionFallback(aiPlayer, gameState, {
      level: AILevel.MEDIUM,
      bluffFrequency: 0.3,
      riskTolerance: 0.5,
      aggressiveness: 0.5
    });
    return {
      ...fallbackDecision,
      reason: '由于OpenAI服务异常，使用备用AI系统做出决策'
    };
  }
} 