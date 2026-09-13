# -*- coding: utf-8 -*-
"""生成 OG 分享卡使用的中文字体子集。

背景：next/og 的 ImageResponse 基于 satori，需要显式传入字体数据；系统字体动辄 16MB，
不能直接进仓库。这里把源字体裁成「GB2312 全部汉字 + ASCII + 中文标点」，产物约 1~2MB。

用法：
    python scripts/make-og-font.py
可用环境变量 OG_FONT_SRC 指定其它源字体（默认取 Windows 等线 Deng.ttf）。

注意：源字体仅在本机用于生成产物，产物 og-subset.ttf 才提交到仓库；
VPS(Linux) 上无需该字体也不会重新生成。
"""
import os
import subprocess
import sys
import tempfile

SRC = os.environ.get('OG_FONT_SRC', r'C:\Windows\Fonts\Deng.ttf')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'src', 'assets', 'fonts', 'og-subset.ttf'))


def gb2312_chars() -> str:
    chars = set()
    # 区 1-9：符号；区 16-87：汉字（一二级共 6763 字）
    for hi in list(range(0xA1, 0xAA)) + list(range(0xB0, 0xF8)):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('gb2312'))
            except Exception:
                pass
    # ASCII 可打印字符
    for i in range(0x20, 0x7F):
        chars.add(chr(i))
    # 常用补充符号（不在 GB2312 内的常见标点/符号）
    chars.update('·—…“”‘’《》〈〉【】（）〔〕、。，；：！？％＃＠＆×÷±≤≥≠√∞°′″¥€£©®™→←↑↓★☆♥✝☧†§¶№')
    return ''.join(sorted(chars))


def main() -> None:
    if not os.path.exists(SRC):
        print('source font not found:', SRC)
        sys.exit(1)

    text = gb2312_chars()
    print('subset chars =', len(text))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix='.txt')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
        subprocess.check_call([
            sys.executable, '-m', 'fontTools.subset', SRC,
            f'--text-file={tmp}',
            f'--output-file={OUT}',
            '--layout-features=*',
            '--no-hinting',
            '--desubroutinize',
            '--drop-tables+=DSIG',
            '--name-IDs=*',
            '--recalc-bounds',
        ])
    finally:
        os.unlink(tmp)

    print('output =', OUT)
    print('bytes  =', os.path.getsize(OUT))


if __name__ == '__main__':
    main()
