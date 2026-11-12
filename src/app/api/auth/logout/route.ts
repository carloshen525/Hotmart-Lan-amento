import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('launch_auth_token');
  response.cookies.delete('launch_active_tenant_id');
  return response;
}
