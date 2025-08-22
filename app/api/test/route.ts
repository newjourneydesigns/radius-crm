import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'Test API endpoint is working',
    timestamp: new Date().toISOString() 
  });
}