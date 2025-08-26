import { NextResponse } from 'next/server';
import { auth } from '@/app/auth';
import { prisma } from '@/app/prisma';

export async function POST(req: Request) {
  console.log('POST /api/tool/update called');
  const session = await auth();
  console.log('Session:', session);
  if (!session || !session.user?.email) {
    console.log('Unauthorized: No session or email');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let indexId, enabled, config;
  try {
    const body = await req.json();
    ({ indexId, enabled, config } = body);
    console.log('Parsed body:', { indexId, enabled, config });
  } catch (err) {
    console.log('Error parsing JSON body:', err);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!indexId || typeof enabled !== 'boolean') {
    console.log('Missing or invalid parameters:', { indexId, enabled });
    return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
  }

  // Get userId from email
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  console.log('User lookup result:', user);
  if (!user) {
    console.log('User not found for email:', session.user.email);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  try {
    if (enabled) {
      // Upsert (create or update) the Tools entry
      console.log('Upserting tool for user:', user.id, 'indexId:', indexId);
      const configToSave = {
        ...(config?.tool_name ? { tool_name: config.tool_name } : {}),
        ...(config?.tool_description ? { tool_description: config.tool_description } : {}),
        // Add preset retrieval parameters if provided
        ...(config?.preset_retrieval_parameters ? { preset_retrieval_parameters: config.preset_retrieval_parameters } : {}),
      };
      await prisma.tools.upsert({
        where: { userId_indexId: { userId: user.id, indexId } },
        update: { config: configToSave },
        create: { userId: user.id, indexId, config: configToSave },
      });
      console.log('Tool enabled');
      return NextResponse.json({ status: 'enabled' });
    } else {
      // Delete the Tools entry if it exists
      console.log('Disabling tool for user:', user.id, 'indexId:', indexId);
      await prisma.tools.deleteMany({
        where: { userId: user.id, indexId },
      });
      console.log('Tool disabled');
      return NextResponse.json({ status: 'disabled' });
    }
  } catch (e) {
    console.log('Database error:', e);
    return NextResponse.json({ error: 'Database error', details: (e as any)?.message }, { status: 500 });
  }
} 
