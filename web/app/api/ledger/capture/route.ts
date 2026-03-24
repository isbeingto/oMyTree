import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const REMOVED_RESPONSE = {
  error: 'Capture API has been removed',
  code: 'GONE',
};

export function GET() {
  return NextResponse.json(REMOVED_RESPONSE, { status: 410 });
}

export function POST() {
  return NextResponse.json(REMOVED_RESPONSE, { status: 410 });
}
