'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Check, X, Heart, Star, ThumbsUp, Zap, Sparkles, Target, Award } from 'lucide-react';

// Floating Action Animation
export const FloatingAction: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ children, onClick, className = '' }) => {
  return (
    <motion.div
      whileHover={{ 
        scale: 1.1, 
        rotate: 5,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)"
      }}
      whileTap={{ scale: 0.9 }}
      animate={{ 
        y: [0, -10, 0],
        rotate: [0, 2, -2, 0]
      }}
      transition={{ 
        duration: 4, 
        repeat: Infinity,
        ease: "easeInOut"
      }}
      onClick={onClick}
      className={`cursor-pointer ${className}`}
    >
      {children}
    </motion.div>
  );
};

// Pulse Animation
export const PulseAnimation: React.FC<{
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
  className?: string;
}> = ({ children, intensity = 'medium', className = '' }) => {
  const intensityConfig = {
    low: { scale: [1, 1.02, 1] },
    medium: { scale: [1, 1.05, 1] },
    high: { scale: [1, 1.1, 1] }
  };

  return (
    <motion.div
      animate={intensityConfig[intensity]}
      transition={{ 
        duration: 2, 
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Bounce Animation
export const BounceAnimation: React.FC<{
  children: React.ReactNode;
  trigger?: boolean;
  className?: string;
}> = ({ children, trigger = false, className = '' }) => {
  return (
    <motion.div
      animate={trigger ? { y: [0, -20, 0] } : {}}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 10 
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Shimmer Effect
export const ShimmerEffect: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      initial={{ opacity: 0.8 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      {children}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ 
          duration: 2, 
          repeat: Infinity,
          ease: "linear"
        }}
      />
    </motion.div>
  );
};

// Success Animation
export const SuccessAnimation: React.FC<{
  trigger: boolean;
  onComplete?: () => void;
  className?: string;
}> = ({ trigger, onComplete, className = '' }) => {
  const controls = useAnimation();

  useEffect(() => {
    if (trigger) {
      controls.start({
        scale: [0, 1.2, 1],
        opacity: [0, 1, 1],
        rotate: [0, 360, 0]
      }).then(() => {
        setTimeout(() => {
          onComplete?.();
        }, 1000);
      });
    }
  }, [trigger, controls, onComplete]);

  return (
    <AnimatePresence>
      {trigger && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={controls}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className={`fixed inset-0 flex items-center justify-center z-50 ${className}`}
        >
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
              filter: ["hue-rotate(0deg)", "hue-rotate(360deg)", "hue-rotate(0deg)"]
            }}
            transition={{ 
              duration: 1, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center"
          >
            <Check className="w-12 h-12 text-white" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Floating Particles
export const FloatingParticles: React.FC<{
  count?: number;
  className?: string;
}> = ({ count = 10, className = '' }) => {
  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100
  }));

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {particles.map(particle => (
        <motion.div
          key={particle.id}
          className="absolute w-2 h-2 bg-blue-400 rounded-full opacity-30"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`
          }}
          animate={{
            y: [0, -100, 0],
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.5]
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// Morphing Button
export const MorphingButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  success?: boolean;
  className?: string;
}> = ({ children, onClick, loading = false, success = false, className = '' }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={loading || success}
      className={`
        relative overflow-hidden px-6 py-3 rounded-xl font-semibold
        transition-all duration-300
        ${loading ? 'bg-blue-400' : success ? 'bg-green-500' : 'bg-blue-500'}
        text-white
        ${className}
      `}
      layout
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center justify-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
            />
          </motion.div>
        ) : success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center justify-center"
          >
            <Check className="w-5 h-5" />
          </motion.div>
        ) : (
          <motion.div
            key="default"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

// Reveal Animation
export const RevealAnimation: React.FC<{
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  className?: string;
}> = ({ children, direction = 'up', delay = 0, className = '' }) => {
  const directionConfig = {
    up: { y: 50, x: 0 },
    down: { y: -50, x: 0 },
    left: { y: 0, x: 50 },
    right: { y: 0, x: -50 }
  };

  return (
    <motion.div
      initial={{ 
        opacity: 0, 
        ...directionConfig[direction]
      }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        y: 0 
      }}
      transition={{ 
        duration: 0.6, 
        delay,
        ease: "easeOut"
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Stagger Animation
export const StaggerAnimation: React.FC<{
  children: React.ReactNode[];
  staggerDelay?: number;
  className?: string;
}> = ({ children, staggerDelay = 0.1, className = '' }) => {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.5, 
            delay: index * staggerDelay,
            ease: "easeOut"
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
};

// Magnetic Effect
export const MagneticEffect: React.FC<{
  children: React.ReactNode;
  strength?: number;
  className?: string;
}> = ({ children, strength = 0.3, className = '' }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = (e.clientX - centerX) * strength;
    const deltaY = (e.clientY - centerY) * strength;
    
    setPosition({ x: deltaX, y: deltaY });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Typing Animation
export const TypingAnimation: React.FC<{
  text: string;
  speed?: number;
  className?: string;
}> = ({ text, speed = 50, className = '' }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, speed);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text, speed]);

  return (
    <span className={className}>
      {displayedText}
      <motion.span
        animate={{ opacity: [0, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="ml-1"
      >
        |
      </motion.span>
    </span>
  );
};

// Confetti Animation
export const ConfettiAnimation: React.FC<{
  trigger: boolean;
  onComplete?: () => void;
  className?: string;
}> = ({ trigger, onComplete, className = '' }) => {
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'][i % 5],
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 2
  }));

  useEffect(() => {
    if (trigger) {
      const timeout = setTimeout(() => {
        onComplete?.();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [trigger, onComplete]);

  return (
    <AnimatePresence>
      {trigger && (
        <div className={`fixed inset-0 pointer-events-none z-50 ${className}`}>
          {confettiPieces.map(piece => (
            <motion.div
              key={piece.id}
              className="absolute w-2 h-2 rounded-full"
              style={{ 
                backgroundColor: piece.color,
                left: `${50 + (Math.random() - 0.5) * 20}%`,
                top: '50%'
              }}
              initial={{ 
                scale: 0,
                y: 0,
                x: 0,
                rotate: 0
              }}
              animate={{ 
                scale: [0, 1, 0],
                y: [0, -300, 300],
                x: [(Math.random() - 0.5) * 400],
                rotate: [0, 360, 720]
              }}
              transition={{ 
                duration: piece.duration,
                delay: piece.delay,
                ease: "easeOut"
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
};

// Glitch Effect
export const GlitchEffect: React.FC<{
  children: React.ReactNode;
  trigger?: boolean;
  className?: string;
}> = ({ children, trigger = false, className = '' }) => {
  return (
    <motion.div
      animate={trigger ? {
        x: [0, -2, 2, -2, 0],
        filter: [
          "hue-rotate(0deg)",
          "hue-rotate(90deg)",
          "hue-rotate(180deg)",
          "hue-rotate(270deg)",
          "hue-rotate(360deg)"
        ]
      } : {}}
      transition={{ 
        duration: 0.2, 
        repeat: trigger ? 3 : 0,
        ease: "easeInOut"
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Ripple Effect
export const RippleEffect: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ children, onClick, className = '' }) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRipple = {
      id: Date.now(),
      x,
      y
    };
    
    setRipples(prev => [...prev, newRipple]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
    
    onClick?.();
  };

  return (
    <div 
      onClick={handleClick}
      className={`relative overflow-hidden ${className}`}
    >
      {children}
      {ripples.map(ripple => (
        <motion.div
          key={ripple.id}
          className="absolute rounded-full bg-white/30 pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            transform: 'translate(-50%, -50%)'
          }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ 
            width: 200, 
            height: 200, 
            opacity: 0 
          }}
          transition={{ duration: 0.6 }}
        />
      ))}
    </div>
  );
}; 