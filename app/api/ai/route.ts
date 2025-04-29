import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL
});

export async function POST(request: Request) {
    try {
        const { prompt } = await request.json();

        // Simple validation
        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL as string,
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
            max_tokens: 4000,
            response_format: { type: "json_object" }
        });

        const responseContent = completion.choices[0].message.content || '{}';
        const aiResponse = JSON.parse(responseContent);
        
        return NextResponse.json(aiResponse,
            { status: 200 }
        );
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { error: 'Failed to create user' },
            { status: 500 }
        );
    }
} 