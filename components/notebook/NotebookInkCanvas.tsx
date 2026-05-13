'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Brush, Eraser, MoreHorizontal, RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import getStroke from 'perfect-freehand';
import type { NotebookInk, NotebookInkStroke } from '../../lib/supabase';

const LOGICAL_WIDTH = 1100;
const MIN_HEIGHT = 1400;
const GROW_ZONE = 200;
const GROW_BY = 600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const MAX_INK_BYTES = 1_000_000;
const SHAPE_HOLD_MS = 1000;
const SHAPE_HOLD_MOVE_THRESHOLD = 8;

type Tool = 'pen' | 'eraser';
type Point = [number, number, number];
type Viewport = { scale: number; translateY: number };
type TrackedPointer = { point: Point; pointerType: string; clientY: number };
type RenderedStroke = NotebookInkStroke & { path: string };
type InkBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; centerX: number; centerY: number };

interface NotebookInkCanvasProps {
  pageId: string;
  ink: NotebookInk | null;
  onChange: (ink: NotebookInk) => void;
}

function makeEmptyInk(viewportHeight = MIN_HEIGHT): NotebookInk {
  return {
    version: 1,
    logicalWidth: LOGICAL_WIDTH,
    contentHeight: Math.max(MIN_HEIGHT, Math.ceil(viewportHeight)),
    strokes: [],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function strokeToPath(points: Point[], size: number) {
  if (!points.length) return '';
  const outline = getStroke(points, {
    size,
    thinning: 0.42,
    smoothing: 0.28,
    streamline: 0.16,
    simulatePressure: false,
  });
  if (!outline.length) return '';

  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...outline[0], 'Q'] as Array<string | number>,
  );
  d.push('Z');
  return d.join(' ');
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitStroke(stroke: NotebookInkStroke, point: Point, eraserRadius: number) {
  const threshold = stroke.size + eraserRadius;
  if (stroke.points.length === 1) {
    const [x, y] = stroke.points[0];
    return Math.hypot(point[0] - x, point[1] - y) <= threshold;
  }
  for (let i = 1; i < stroke.points.length; i += 1) {
    const [ax, ay] = stroke.points[i - 1];
    const [bx, by] = stroke.points[i];
    if (distanceToSegment(point[0], point[1], ax, ay, bx, by) <= threshold) return true;
  }
  return false;
}

function removeDuplicatePoints(points: Point[], threshold = 0.25) {
  if (points.length <= 2) return points;
  const keep: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = keep[keep.length - 1];
    if (Math.hypot(points[i][0] - previous[0], points[i][1] - previous[1]) >= threshold) {
      keep.push(points[i]);
    }
  }
  const last = points[points.length - 1];
  const previous = keep[keep.length - 1];
  if (last !== previous) keep.push(last);
  return keep;
}

function getBounds(points: Point[]): InkBounds {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function pathLength(points: Point[]) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

function distanceToLine(point: Point, start: Point, end: Point) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function simplifyPoints(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToLine(points[i], points[0], points[points.length - 1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = i;
    }
  }

  if (farthestDistance <= epsilon) return [points[0], points[points.length - 1]];
  const before = simplifyPoints(points.slice(0, farthestIndex + 1), epsilon);
  const after = simplifyPoints(points.slice(farthestIndex), epsilon);
  return [...before.slice(0, -1), ...after];
}

function normalizeClosedVertices(points: Point[], bounds: InkBounds) {
  const epsilon = Math.max(14, Math.min(bounds.width, bounds.height) * 0.08);
  const simplified = simplifyPoints(points, epsilon);
  const vertices = simplified.slice();
  if (vertices.length > 2 && Math.hypot(vertices[0][0] - vertices[vertices.length - 1][0], vertices[0][1] - vertices[vertices.length - 1][1]) < epsilon * 1.6) {
    vertices.pop();
  }
  return vertices;
}

function pointsFromVertices(vertices: Array<[number, number]>, pressure: number): Point[] {
  return vertices.map(([x, y]) => [x, y, pressure]);
}

function makeCirclePoints(bounds: InkBounds, pressure: number): Point[] {
  const radius = Math.max(bounds.width, bounds.height) / 2;
  const points: Point[] = [];
  for (let i = 0; i <= 48; i += 1) {
    const angle = (Math.PI * 2 * i) / 48;
    points.push([
      bounds.centerX + Math.cos(angle) * radius,
      bounds.centerY + Math.sin(angle) * radius,
      pressure,
    ]);
  }
  return points;
}

function makeSquarePoints(bounds: InkBounds, pressure: number): Point[] {
  const side = Math.max(bounds.width, bounds.height);
  const left = bounds.centerX - side / 2;
  const right = bounds.centerX + side / 2;
  const top = bounds.centerY - side / 2;
  const bottom = bounds.centerY + side / 2;
  return pointsFromVertices([
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ], pressure);
}

function makeTrianglePoints(vertices: Point[], bounds: InkBounds, pressure: number): Point[] {
  const triangle = vertices.length >= 3 && vertices.length <= 5
    ? vertices.slice(0, 3).map(point => [point[0], point[1]] as [number, number])
    : [
      [bounds.centerX, bounds.minY],
      [bounds.maxX, bounds.maxY],
      [bounds.minX, bounds.maxY],
    ] as Array<[number, number]>;
  return pointsFromVertices([...triangle, triangle[0]], pressure);
}

function makeArrowPoints(points: Point[], bounds: InkBounds, pressure: number): Point[] | null {
  const start = points[0];
  let tip = points[0];
  let tipDistance = 0;
  for (const point of points) {
    const distance = Math.hypot(point[0] - start[0], point[1] - start[1]);
    if (distance > tipDistance) {
      tip = point;
      tipDistance = distance;
    }
  }

  if (tipDistance < Math.max(80, Math.min(bounds.width, bounds.height) * 1.2)) return null;

  const angle = Math.atan2(tip[1] - start[1], tip[0] - start[0]);
  const headLength = clamp(tipDistance * 0.22, 28, 90);
  const headAngle = Math.PI / 7;
  const left: Point = [
    tip[0] - Math.cos(angle - headAngle) * headLength,
    tip[1] - Math.sin(angle - headAngle) * headLength,
    pressure,
  ];
  const right: Point = [
    tip[0] - Math.cos(angle + headAngle) * headLength,
    tip[1] - Math.sin(angle + headAngle) * headLength,
    pressure,
  ];

  return [
    [start[0], start[1], pressure],
    [tip[0], tip[1], pressure],
    left,
    [tip[0], tip[1], pressure],
    right,
  ];
}

function cleanHeldShape(points: Point[]): Point[] | null {
  if (points.length < 6) return null;
  const bounds = getBounds(points);
  const minDimension = Math.min(bounds.width, bounds.height);
  const maxDimension = Math.max(bounds.width, bounds.height);
  if (maxDimension < 42) return null;

  const pressure = points.reduce((sum, point) => sum + point[2], 0) / points.length || 0.5;
  const closingDistance = Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]);
  const closed = minDimension > 0 && closingDistance <= Math.max(44, maxDimension * 0.24);

  if (!closed) {
    const simplified = simplifyPoints(points, Math.max(12, maxDimension * 0.06));
    const straightness = Math.hypot(points[points.length - 1][0] - points[0][0], points[points.length - 1][1] - points[0][1]) / Math.max(pathLength(points), 1);
    if (simplified.length >= 4 && simplified.length <= 8 && straightness < 0.86) return makeArrowPoints(points, bounds, pressure);
    return null;
  }

  const vertices = normalizeClosedVertices(points, bounds);
  if (vertices.length === 3) return makeTrianglePoints(vertices, bounds, pressure);
  if (vertices.length >= 4 && vertices.length <= 6) return makeSquarePoints(bounds, pressure);

  const aspect = bounds.width / Math.max(bounds.height, 1);
  if (aspect >= 0.65 && aspect <= 1.35) return makeCirclePoints(bounds, pressure);

  return null;
}

function getEstimatedInkByteSize(ink: NotebookInk) {
  return ink.strokes.reduce((total, stroke) => total + 140 + stroke.points.length * 24, 96);
}

export default function NotebookInkCanvas({ pageId, ink, onChange }: NotebookInkCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const viewportStateRef = useRef<Viewport>({ scale: 1, translateY: 0 });
  const pageIdRef = useRef(pageId);
  const draftInkRef = useRef<NotebookInk>(ink ?? makeEmptyInk());
  const pathCacheRef = useRef(new Map<string, { stroke: NotebookInkStroke; path: string }>());
  const warningTimerRef = useRef<number | null>(null);
  const activePointersRef = useRef(new Map<number, TrackedPointer>());
  const strokePointerRef = useRef<number | null>(null);
  const currentStrokeRef = useRef<Point[]>([]);
  const shapeHoldRef = useRef<{ lastMoveAt: number; lastPoint: Point | null }>({ lastMoveAt: 0, lastPoint: null });
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const touchPanRef = useRef<{ centerY: number; translateY: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [draftInk, setDraftInk] = useState<NotebookInk>(() => ink ?? makeEmptyInk());
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#f8fafc');
  const [size, setSize] = useState(8);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, translateY: 0 });
  const [pencilOnly, setPencilOnly] = useState(false);
  const [undoStack, setUndoStack] = useState<NotebookInk[]>([]);
  const [redoStack, setRedoStack] = useState<NotebookInk[]>([]);
  const [payloadWarning, setPayloadWarning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  function schedulePayloadWarning(nextInk: NotebookInk) {
    if (warningTimerRef.current !== null) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => {
      warningTimerRef.current = null;
      setPayloadWarning(getEstimatedInkByteSize(nextInk) > MAX_INK_BYTES);
    }, 500);
  }

  useEffect(() => {
    const nextInk = ink ?? makeEmptyInk(viewportRef.current?.clientHeight);
    const pageChanged = pageIdRef.current !== pageId;

    pageIdRef.current = pageId;
    if (!pageChanged) return;

    draftInkRef.current = nextInk;
    pathCacheRef.current.clear();
    setDraftInk(nextInk);
    schedulePayloadWarning(nextInk);
    setUndoStack([]);
    setRedoStack([]);
    clearCanvas();
  }, [pageId, ink]);

  useEffect(() => () => {
    if (warningTimerRef.current !== null) window.clearTimeout(warningTimerRef.current);
  }, []);

  const paths = useMemo(() => {
    const activeStrokeIds = new Set(draftInk.strokes.map(stroke => stroke.id));
    pathCacheRef.current.forEach((_, strokeId) => {
      if (!activeStrokeIds.has(strokeId)) pathCacheRef.current.delete(strokeId);
    });

    return draftInk.strokes.map((stroke): RenderedStroke => {
      const cached = pathCacheRef.current.get(stroke.id);
      if (cached?.stroke === stroke) return { ...stroke, path: cached.path };
      const path = strokeToPath(stroke.points, stroke.size);
      pathCacheRef.current.set(stroke.id, { stroke, path });
      return { ...stroke, path };
    });
  }, [draftInk.strokes]);

  const clampTranslate = useCallback((scale: number, translateY: number) => {
    const viewportHeight = viewportRef.current?.clientHeight ?? 0;
    const stageHeight = (stageRef.current?.offsetHeight ?? draftInk.contentHeight) * scale;
    const min = Math.min(0, viewportHeight - stageHeight - 80);
    return clamp(translateY, min, 80);
  }, [draftInk.contentHeight]);

  const updateViewport = useCallback((next: Viewport) => {
    const scale = clamp(next.scale, MIN_ZOOM, MAX_ZOOM);
    const nextViewport = { scale, translateY: clampTranslate(scale, next.translateY) };
    viewportStateRef.current = nextViewport;
    setViewport(nextViewport);
  }, [clampTranslate]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const drawInProgress = useCallback(() => {
    rafRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (canvas.width !== draftInk.logicalWidth || canvas.height !== draftInk.contentHeight) {
      canvas.width = draftInk.logicalWidth;
      canvas.height = draftInk.contentHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const points = currentStrokeRef.current;
    if (!points.length) return;
    const path = strokeToPath(points, size);
    if (!path) return;
    ctx.fillStyle = color;
    ctx.fill(new Path2D(path));
  }, [color, draftInk.contentHeight, draftInk.logicalWidth, size]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(drawInProgress);
  }, [drawInProgress]);

  const pointFromEvent = useCallback((event: React.PointerEvent | PointerEvent): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0, 0.5];
    const x = clamp(((event.clientX - rect.left) / rect.width) * draftInk.logicalWidth, 0, draftInk.logicalWidth);
    const y = clamp(((event.clientY - rect.top) / rect.height) * draftInk.contentHeight, 0, draftInk.contentHeight);
    const pressure = event.pointerType === 'mouse' ? 0.5 : clamp(Math.pow(event.pressure || 0.5, 0.5), 0.05, 1);
    return [x, y, pressure];
  }, [draftInk.contentHeight, draftInk.logicalWidth]);

  const commitInk = useCallback((nextInk: NotebookInk) => {
    draftInkRef.current = nextInk;
    setDraftInk(nextInk);
    schedulePayloadWarning(nextInk);
    onChange(nextInk);
  }, [onChange]);

  const pushHistory = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-24), draftInkRef.current]);
    setRedoStack([]);
  }, []);

  const getTouchPointers = () =>
    Array.from(activePointersRef.current.values()).filter(pointer => pointer.pointerType === 'touch');

  const startTouchPan = (centerY: number) => {
    currentStrokeRef.current = [];
    clearCanvas();
    touchPanRef.current = {
      centerY,
      translateY: viewportStateRef.current.translateY,
    };
    return true;
  };

  const startTouchPanIfReady = (event: React.PointerEvent<HTMLDivElement>) => {
    const touches = getTouchPointers();
    if (touches.length < 2 || strokePointerRef.current !== null) return false;
    const [first, second] = touches;
    return startTouchPan((first.clientY + second.clientY) / 2 || event.clientY);
  };

  const pointsFromCoalescedEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    return samples.map(sample => pointFromEvent(sample));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = pointFromEvent(event);

    if (event.pointerType === 'pen') {
      setPencilOnly(true);
    }

    // Palm rejection: once Pencil is active, touch input never interrupts an in-progress stroke.
    if (pencilOnly && event.pointerType === 'touch' && strokePointerRef.current !== null) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { point, pointerType: event.pointerType, clientY: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.pointerType === 'touch' && startTouchPanIfReady(event)) return;
    if (pencilOnly && event.pointerType === 'touch' && startTouchPan(event.clientY)) return;
    if (pencilOnly && event.pointerType === 'touch') return;

    strokePointerRef.current = event.pointerId;

    if (tool === 'eraser') {
      deletedIdsRef.current = new Set();
      eraseAt(point);
      return;
    }

    shapeHoldRef.current = { lastMoveAt: performance.now(), lastPoint: point };
    currentStrokeRef.current = [point];
    scheduleDraw();
  };

  const eraseAt = (point: Point) => {
    const currentInk = draftInkRef.current;
    for (let i = currentInk.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = currentInk.strokes[i];
      if (!deletedIdsRef.current.has(stroke.id) && hitStroke(stroke, point, 14)) {
        deletedIdsRef.current.add(stroke.id);
        break;
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = pointFromEvent(event);
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { point, pointerType: event.pointerType, clientY: event.clientY });
    }

    if (touchPanRef.current) {
      const touches = getTouchPointers();
      if (!touches.length) return;
      const centerY = touches.reduce((sum, touch) => sum + touch.clientY, 0) / touches.length;
      updateViewport({
        scale: viewportStateRef.current.scale,
        translateY: touchPanRef.current.translateY + (centerY - touchPanRef.current.centerY),
      });
      return;
    }

    if (strokePointerRef.current !== event.pointerId) return;
    if (tool === 'eraser') {
      pointsFromCoalescedEvent(event).forEach(eraseAt);
      return;
    }
    const points = pointsFromCoalescedEvent(event);
    const holdState = shapeHoldRef.current;
    points.forEach(sample => {
      const lastPoint = holdState.lastPoint;
      if (!lastPoint || Math.hypot(sample[0] - lastPoint[0], sample[1] - lastPoint[1]) >= SHAPE_HOLD_MOVE_THRESHOLD) {
        holdState.lastMoveAt = performance.now();
        holdState.lastPoint = sample;
      }
    });
    currentStrokeRef.current.push(...points);
    scheduleDraw();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);
    if (getTouchPointers().length < 2) touchPanRef.current = null;

    if (strokePointerRef.current !== event.pointerId) return;
    strokePointerRef.current = null;

    if (tool === 'eraser') {
      eraseAt(pointFromEvent(event));
      if (deletedIdsRef.current.size) {
        pushHistory();
        const currentInk = draftInkRef.current;
        commitInk({
          ...currentInk,
          strokes: currentInk.strokes.filter(stroke => !deletedIdsRef.current.has(stroke.id)),
        });
      }
      deletedIdsRef.current = new Set();
      return;
    }

    const upPoint = pointFromEvent(event);
    const holdState = shapeHoldRef.current;
    if (!holdState.lastPoint || Math.hypot(upPoint[0] - holdState.lastPoint[0], upPoint[1] - holdState.lastPoint[1]) >= SHAPE_HOLD_MOVE_THRESHOLD) {
      holdState.lastMoveAt = performance.now();
      holdState.lastPoint = upPoint;
    }
    currentStrokeRef.current.push(upPoint);
    const heldForShape = performance.now() - shapeHoldRef.current.lastMoveAt >= SHAPE_HOLD_MS;
    const rawPoints = removeDuplicatePoints(currentStrokeRef.current);
    const cleanedShape = heldForShape
      ? cleanHeldShape(rawPoints)?.map(([x, y, pressure]) => [
        clamp(x, 0, draftInkRef.current.logicalWidth),
        clamp(y, 0, draftInkRef.current.contentHeight),
        pressure,
      ] as Point)
      : null;
    const points = cleanedShape ?? rawPoints;
    currentStrokeRef.current = [];
    shapeHoldRef.current = { lastMoveAt: 0, lastPoint: null };
    clearCanvas();
    if (points.length < 2) {
      const [x, y, pressure] = points[0] ?? pointFromEvent(event);
      points.push([x + 0.75, y + 0.75, pressure]);
    }

    pushHistory();
    const maxY = Math.max(...points.map(p => p[1]));
    const currentInk = draftInkRef.current;
    const contentHeight = maxY > currentInk.contentHeight - GROW_ZONE
      ? currentInk.contentHeight + GROW_BY
      : currentInk.contentHeight;
    commitInk({
      ...currentInk,
      contentHeight,
      strokes: [
        ...currentInk.strokes,
        {
          id: crypto.randomUUID(),
          mode: 'pen',
          color,
          size,
          points,
        },
      ],
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateViewport({ scale: viewport.scale, translateY: viewport.translateY - event.deltaY });
  };

  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, draftInkRef.current]);
    commitInk(previous);
  };

  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, draftInkRef.current]);
    commitInk(next);
  };

  const clear = () => {
    if (!draftInkRef.current.strokes.length) return;
    setMenuOpen(false);
    if (!window.confirm('Clear all ink from this page?')) return;
    pushHistory();
    commitInk({ ...draftInkRef.current, strokes: [] });
  };

  const toggleMenu = () => {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 6,
        left: Math.max(8, rect.right - 176),
      });
    }
    setMenuOpen(open => !open);
  };

  const colors = [
    { name: 'White', value: '#f8fafc' },
    { name: 'Gray', value: '#94a3b8' },
    { name: 'Black', value: '#111827' },
    { name: 'Indigo', value: '#818cf8' },
    { name: 'Blue', value: '#38bdf8' },
    { name: 'Teal', value: '#2dd4bf' },
    { name: 'Green', value: '#34d399' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Orange', value: '#fb923c' },
    { name: 'Red', value: '#f87171' },
    { name: 'Pink', value: '#f472b6' },
    { name: 'Violet', value: '#a78bfa' },
  ];
  const sizes = [
    { label: 'S', value: 5 },
    { label: 'M', value: 8 },
    { label: 'L', value: 13 },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border border-white/[0.08] bg-[#0b0d13] overflow-hidden">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.08] bg-[#111421] px-3 py-2 touch-none select-none">
        <div className="flex shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          <button type="button" onClick={() => setTool('pen')} className={`p-2 rounded ${tool === 'pen' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Pen">
            <Brush className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`} title="Stroke eraser">
            <Eraser className="h-4 w-4" />
          </button>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1">
          {colors.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                color === c.value ? 'border-white ring-2 ring-indigo-400/70' : 'border-white/20'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
              aria-label={`${c.name} ink`}
            />
          ))}
        </div>

        <div className="flex shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          {sizes.map(option => (
            <button
              key={option.label}
              type="button"
              onClick={() => setSize(option.value)}
              className={`h-8 min-w-8 rounded px-2 text-xs font-semibold ${size === option.value ? 'bg-white text-[#111421]' : 'text-gray-400 hover:text-white'}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] p-0.5">
          <button type="button" onClick={undo} disabled={!undoStack.length} className="p-2 rounded text-gray-400 hover:text-white disabled:opacity-30" title="Undo">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={redo} disabled={!redoStack.length} className="p-2 rounded text-gray-400 hover:text-white disabled:opacity-30" title="Redo">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => updateViewport({ scale: viewport.scale - 0.1, translateY: viewport.translateY })} className="p-2 rounded text-gray-400 hover:text-white" title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => updateViewport({ scale: 1, translateY: 0 })}
            className="w-12 rounded px-1 py-2 text-center text-xs tabular-nums text-gray-500 hover:bg-white/[0.06] hover:text-gray-300"
            title="Reset zoom"
          >
            {Math.round(viewport.scale * 100)}%
          </button>
          <button type="button" onClick={() => updateViewport({ scale: viewport.scale + 0.1, translateY: viewport.translateY })} className="p-2 rounded text-gray-400 hover:text-white" title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggleMenu}
            className={`rounded p-2 text-gray-400 hover:text-white ${menuOpen ? 'bg-white/[0.08] text-white' : ''}`}
            title={payloadWarning ? 'Ink options - large ink page' : 'Ink options'}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="relative block">
              <MoreHorizontal className="h-4 w-4" />
              {payloadWarning && (
                <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-300" />
              )}
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close ink options"
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="menu"
            className="fixed z-50 w-44 rounded-lg border border-white/[0.1] bg-[#1e2130] py-1 shadow-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {payloadWarning && (
              <div className="border-b border-white/[0.06] px-3 py-2 text-xs text-amber-200">
                Large ink page
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={clear}
              disabled={!draftInk.strokes.length}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-red-200 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </button>
          </div>
        </>
      )}

      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-[#090b10] select-none"
        style={{
          touchAction: 'none',
          overscrollBehavior: 'contain',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as React.CSSProperties}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={event => event.preventDefault()}
        onSelect={event => event.preventDefault()}
      >
        <div className="absolute left-1/2 top-0 w-full -translate-x-1/2 px-4 py-4">
          <div
            ref={stageRef}
            className="relative mx-auto bg-[#151821] shadow-2xl shadow-black/40"
            style={{
              aspectRatio: `${draftInk.logicalWidth} / ${draftInk.contentHeight}`,
              transform: `translate3d(0, ${viewport.translateY}px, 0) scale(${viewport.scale})`,
              transformOrigin: 'top center',
            }}
          >
            <svg
              viewBox={`0 0 ${draftInk.logicalWidth} ${draftInk.contentHeight}`}
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Notebook ink page"
            >
              {paths.map(stroke => (
                <path key={stroke.id} d={stroke.path} fill={stroke.color} />
              ))}
            </svg>
            <canvas
              ref={canvasRef}
              width={draftInk.logicalWidth}
              height={draftInk.contentHeight}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
