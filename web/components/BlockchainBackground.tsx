"use client";

import { useEffect, useRef } from 'react';

interface Block {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  connections: number[];
}

export default function BlockchainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blocksRef = useRef<Block[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize blocks
    const blockCount = 50;
    blocksRef.current = Array.from({ length: blockCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3 + 2,
      connections: []
    }));

    // Mouse events
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleMouseDown = () => {
      mouseRef.current.active = true;
    };

    const handleMouseUp = () => {
      mouseRef.current.active = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      mouseRef.current.x = e.touches[0].clientX;
      mouseRef.current.y = e.touches[0].clientY;
      mouseRef.current.active = true;
    };

    const handleTouchEnd = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'; // Dark overlay for trail effect
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const blocks = blocksRef.current;
      const mouse = mouseRef.current;

      // Update and draw blocks
      blocks.forEach((block, i) => {
        // Mouse interaction
        if (mouse.active) {
          const dx = mouse.x - block.x;
          const dy = mouse.y - block.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 200) {
            const force = (200 - dist) / 200;
            block.vx += (dx / dist) * force * 0.5;
            block.vy += (dy / dist) * force * 0.5;
          }
        }

        // Update position
        block.x += block.vx;
        block.y += block.vy;

        // Damping
        block.vx *= 0.99;
        block.vy *= 0.99;

        // Boundary bounce
        if (block.x < 0 || block.x > canvas.width) block.vx *= -1;
        if (block.y < 0 || block.y > canvas.height) block.vy *= -1;

        // Keep in bounds
        block.x = Math.max(0, Math.min(canvas.width, block.x));
        block.y = Math.max(0, Math.min(canvas.height, block.y));

        // Draw connections
        blocks.forEach((other, j) => {
          if (i >= j) return;
          
          const dx = other.x - block.x;
          const dy = other.y - block.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            const opacity = 1 - dist / 150;
            ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(block.x, block.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        });

        // Draw block
        ctx.fillStyle = '#3b82f6';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#3b82f6';
        ctx.beginPath();
        ctx.arc(block.x, block.y, block.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-auto"
      style={{ zIndex: 0 }}
    />
  );
}
