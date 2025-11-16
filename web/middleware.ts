import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const basicAuth = request.headers.get('authorization');

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    // Use Buffer.from instead of atob for Edge Runtime
    const [user, pwd] = Buffer.from(authValue, 'base64').toString().split(':');
    
    if (user === 'admin' && pwd === 'StakePoint2025') {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  });
}

// Only protect admin routes
export const config = {
  matcher: ['/admin/:path*'],
};
