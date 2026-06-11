export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, isAuthResult } from '@/lib/auth';
import { deleteObject } from '@/lib/storage';

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const authResult = await requireAuth(request);
    if (!isAuthResult(authResult)) return authResult;

    const { id } = await context.params;

    const session = await prisma.mediaSession.findUnique({
        where: { id },
        select: { userId: true, objectKey: true, thumbnailKey: true },
    });

    if (!session || session.userId !== authResult.user.userId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.mediaSession.delete({ where: { id } });

    // Best-effort R2 cleanup after DB row is gone
    const keys = [session.objectKey, session.thumbnailKey].filter(Boolean) as string[];
    await Promise.allSettled(keys.map((key) => deleteObject(key)));

    return NextResponse.json({ success: true });
}
