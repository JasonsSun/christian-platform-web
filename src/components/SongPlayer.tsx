'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

export interface Song {
  id: string;
  title: string;
  artist: string;
  category: string;
  bpm: number;
  key: string;
  coverGradient: string;
  lyrics: string[];
  playCount?: number;
  chords?: string[];
}

interface SongPlayerProps {
  song: Song;
  queue?: Song[];
  currentIndex?: number;
  onSongChange?: (index: number) => void;
}

// 播放速度选项
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// 格式化播放次数
function formatPlayCount(count: number): string {
  if (count >= 10000) {
    return (count / 10000).toFixed(1) + '万';
  }
  return count.toString();
}

export function SongPlayer({ song, queue = [], currentIndex = 0, onSongChange }: SongPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [currentTime, setCurrentTime] = useState(0); // 秒
  const [duration] = useState(263); // 4:23 模拟时长
  const [pitchShift, setPitchShift] = useState(0); // -6 ~ +6 半音
  const [speed, setSpeed] = useState(1);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // 模拟播放进度
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + speed;
        return next >= duration ? 0 : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, speed, duration]);

  // 同步进度条
  useEffect(() => {
    setProgress((currentTime / duration) * 100);
  }, [currentTime, duration]);

  // 播放结束时自动切到下一首（仅当从非零值回到 0 时触发）
  const prevTimeRef = useRef(0);
  useEffect(() => {
    const prev = prevTimeRef.current;
    prevTimeRef.current = currentTime;
    if (prev > 0 && currentTime === 0 && isPlaying) {
      handleNextRef.current?.();
    }
  }, [currentTime, isPlaying]);

  const handlePrev = useCallback(() => {
    if (onSongChange && queue.length > 0) {
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
      onSongChange(prevIndex);
      setCurrentTime(0);
    }
  }, [onSongChange, queue.length, currentIndex]);

  const handleNext = useCallback(() => {
    if (onSongChange && queue.length > 0) {
      const nextIndex = (currentIndex + 1) % queue.length;
      onSongChange(nextIndex);
      setCurrentTime(0);
    }
  }, [onSongChange, queue.length, currentIndex]);

  // 保持 handleNext 的最新引用，避免定时器闭包过期
  const handleNextRef = useRef(handleNext);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setProgress(value);
    setCurrentTime((value / 100) * duration);
  };

  const togglePlay = () => setIsPlaying((p) => !p);
  const toggleFavorite = () => setIsFavorited((f) => !f);
  const toggleShare = () => setIsSharing((s) => !s);

  const adjustPitch = (delta: number) => {
    setPitchShift((prev) => Math.max(-6, Math.min(6, prev + delta)));
  };

  const cycleSpeed = () => {
    const currentIdx = SPEED_OPTIONS.indexOf(speed);
    const nextIdx = (currentIdx + 1) % SPEED_OPTIONS.length;
    setSpeed(SPEED_OPTIONS[nextIdx]);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full">
      {/* 专辑封面 */}
      <div className="relative w-full aspect-square max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-primary-900/40">
        <div
          className={`absolute inset-0 ${isPlaying ? 'animate-[spin_20s_linear_infinite]' : ''}`}
          style={{ background: song.coverGradient, animationPlayState: isPlaying ? 'running' : 'paused' }}
        >
          {/* 装饰性光晕 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-white/20 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-white/15 rounded-full blur-2xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        </div>

        {/* 中心信息 */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-white p-6">
          <div className="text-6xl md:text-7xl font-display font-bold drop-shadow-lg">
            {song.title.charAt(0)}
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.3em] text-white/70">
            {song.category}
          </div>
        </div>

        {/* 中心黑胶效果 */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm border-4 border-white/30" />
          </div>
        )}
      </div>

      {/* 歌曲信息 */}
      <div className="mt-8 text-center">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-white drop-shadow-lg leading-tight">
          {song.title}
        </h1>
        <p className="mt-2 text-white/80 text-lg">{song.artist}</p>
        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-medium">
            {song.category}
          </span>
          <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-medium">
            BPM {song.bpm}
          </span>
          <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-medium">
            Key {song.key}
          </span>
          {song.playCount && (
            <span className="px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {formatPlayCount(song.playCount)}
            </span>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-8 px-2">
        <div className="relative">
          <input
            type="range"
            min="0"
            max="100"
            value={progress}
            onChange={handleSeek}
            className="song-progress w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${progress}%, rgba(255,255,255,0.25) ${progress}%, rgba(255,255,255,0.25) 100%)`,
            }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/70 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 播放控制 */}
      <div className="mt-6 flex items-center justify-center gap-4 md:gap-6">
        {/* 上一首 */}
        <button
          onClick={handlePrev}
          className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-300"
          aria-label="上一首"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* 播放/暂停 */}
        <button
          onClick={togglePlay}
          className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 text-white flex items-center justify-center shadow-xl shadow-gold-500/40 hover:scale-105 active:scale-95 transition-all duration-300"
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <svg className="w-7 h-7 md:w-8 md:h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg className="w-7 h-7 md:w-8 md:h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 下一首 */}
        <button
          onClick={handleNext}
          className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-300"
          aria-label="下一首"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* 功能按钮组 */}
      <div className="mt-6 flex items-center justify-center gap-3 md:gap-4 flex-wrap">
        {/* 调音调 */}
        <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-2 py-1">
          <button
            onClick={() => adjustPitch(-1)}
            className="w-8 h-8 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="降调"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <span className="text-white text-xs font-medium min-w-[40px] text-center">
            {pitchShift > 0 ? `+${pitchShift}` : pitchShift}
          </span>
          <button
            onClick={() => adjustPitch(1)}
            className="w-8 h-8 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="升调"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* 播放速度 */}
        <button
          onClick={cycleSpeed}
          className="h-10 px-4 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors"
        >
          {speed}x
        </button>

        {/* 收藏 */}
        <button
          onClick={toggleFavorite}
          className={`h-10 px-4 rounded-full backdrop-blur-sm border text-sm font-medium transition-all duration-300 flex items-center gap-1.5 ${
            isFavorited
              ? 'bg-gradient-to-r from-gold-500 to-gold-400 border-gold-300 text-white shadow-gold'
              : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
          }`}
        >
          <svg className="w-4 h-4" fill={isFavorited ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="hidden sm:inline">收藏</span>
        </button>

        {/* 分享 */}
        <button
          onClick={toggleShare}
          className="h-10 px-4 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-white/20 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="hidden sm:inline">分享</span>
        </button>
      </div>

      {/* 分享面板 */}
      {isSharing && (
        <div className="mt-4 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
          <p className="text-white/80 text-sm text-center mb-3">分享到</p>
          <div className="flex items-center justify-center gap-3">
            {['微信', 'QQ', '微博', '复制链接'].map((platform) => (
              <button
                key={platform}
                onClick={() => setIsSharing(false)}
                className="px-4 py-2 rounded-xl bg-white/15 border border-white/25 text-white text-xs hover:bg-white/25 transition-colors"
              >
                {platform}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
