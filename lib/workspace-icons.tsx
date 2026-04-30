'use client'

import {
  Star, Heart, Flame, Zap, BookOpen, Music, Globe, Target,
  Lightbulb, Rocket, Leaf, Gem, Trophy, Palette, FileText, Settings,
  Home, Briefcase, Code, Coffee, Camera, Gift, Calendar, Users,
  Folder, Mail, Phone, ShoppingBag, Plane, Car, Gamepad2, Headphones
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Map icon names to Lucide components
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  star: Star, heart: Heart, flame: Flame, zap: Zap,
  book: BookOpen, music: Music, globe: Globe, target: Target,
  lightbulb: Lightbulb, rocket: Rocket, leaf: Leaf, gem: Gem,
  trophy: Trophy, palette: Palette, file: FileText, settings: Settings,
  home: Home, briefcase: Briefcase, code: Code, coffee: Coffee,
  camera: Camera, gift: Gift, calendar: Calendar, users: Users,
  folder: Folder, mail: Mail, phone: Phone, shopping: ShoppingBag,
  plane: Plane, car: Car, gamepad: Gamepad2, headphones: Headphones,
}

export const PRESET_ICON_NAMES = Object.keys(ICON_MAP)

export const PRESET_ICONS = PRESET_ICON_NAMES.map(name => ({
  value: name,
  label: name.charAt(0).toUpperCase() + name.slice(1),
}))

interface WorkspaceIconProps {
  icon?: string
  fallback?: string
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showBackground?: boolean
}

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
}

const containerSizeClasses = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
}

export function WorkspaceIcon({
  icon,
  fallback = '',
  color = '#888',
  size = 'md',
  className,
  showBackground = false,
}: WorkspaceIconProps) {
  // Check if it's a custom image (data URL or http URL)
  const isCustomImage = icon?.startsWith('data:') || icon?.startsWith('http')
  
  // Check if it's a Lucide icon name
  const IconComponent = icon && !isCustomImage ? ICON_MAP[icon] : null
  
  // Check if it's an emoji (legacy support)
  const isEmoji = icon && !isCustomImage && !IconComponent && /[\u{1F300}-\u{1F9FF}]/u.test(icon)
  
  const content = (
    <>
      {isCustomImage && (
        <img 
          src={icon} 
          alt="icon" 
          className={cn(sizeClasses[size], 'rounded object-cover')}
        />
      )}
      {IconComponent && (
        <IconComponent className={cn(sizeClasses[size])} />
      )}
      {isEmoji && (
        <span className={cn(
          size === 'xs' && 'text-[10px]',
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm',
          size === 'lg' && 'text-base',
          size === 'xl' && 'text-lg',
        )}>
          {icon}
        </span>
      )}
      {!icon && fallback && (
        <span className={cn(
          'font-semibold',
          size === 'xs' && 'text-[8px]',
          size === 'sm' && 'text-[10px]',
          size === 'md' && 'text-xs',
          size === 'lg' && 'text-sm',
          size === 'xl' && 'text-base',
        )}>
          {fallback.charAt(0).toUpperCase()}
        </span>
      )}
    </>
  )

  if (showBackground) {
    return (
      <div
        className={cn(
          containerSizeClasses[size],
          'rounded-lg flex items-center justify-center overflow-hidden',
          className
        )}
        style={{ 
          backgroundColor: `${color}15`, 
          border: `1.5px solid ${color}30`,
          color 
        }}
      >
        {content}
      </div>
    )
  }

  return (
    <span className={cn('inline-flex items-center justify-center', className)} style={{ color }}>
      {content}
    </span>
  )
}
