import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/isAdminSession';
import { prisma } from '@/lib/prisma';

// Admin-only, lightweight: updates just the sequence position, without needing
// (and without risk of clobbering) the rest of the challenge's fields — unlike
// PUT /api/admin/challenges, which expects and overwrites the full object.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const order = body?.order;
  if (typeof order !== 'number' || !Number.isFinite(order)) {
    return NextResponse.json({ error: 'order must be a number' }, { status: 400 });
  }
  try {
    const updated = await prisma.challenge.update({ where: { id }, data: { order } });
    return NextResponse.json({ id: updated.id, order: updated.order });
  } catch (error) {
    console.error('Error updating challenge order:', error);
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }
}
