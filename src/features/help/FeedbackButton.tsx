import { useState, type ClipboardEvent } from 'react';
import { useLocation, useMatches } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMeSure } from '@/core/me';
import { Seg } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/Toast';
import { uploadFile } from '@/api/files';
import type { FileRef } from '@/api/types';
import { feedbackApi, type FeedbackKind } from './api';
import { deleteConfirm } from '@/ui/Confirm';

const MAX_IMAGES = 3;
const MAX_FILES = 5;
const MAX_FILE_MB = 20;
const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z';

/** 截图压到长边 1600、JPEG，一张一般 100–300KB */
export function shrinkImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
    img.src = url;
  });
}

export function usePageTitle() {
  const m = useMatches();
  const h = [...m].reverse().find((x) => (x.handle as { title?: string } | undefined)?.title);
  return (h?.handle as { title?: string } | undefined)?.title ?? document.title;
}

/** 提交问题反馈的表单，放在右侧「问题反馈」面板里；initialText 是带过来的初始内容 */
export function FeedbackForm({ initialText = '', onDone }: { initialText?: string; onDone: () => void }) {
  const me = useMeSure();
  const title = usePageTitle();
  const page = window.location.hash.slice(1) || '/';
  const [kind, setKind] = useState<FeedbackKind>('问题');
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const qc = useQueryClient();

  const addFiles = (list: File[]) => {
    const bad = list.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (bad) { toast(`${bad.name} 超过 ${MAX_FILE_MB}MB`, { tone: 'bad' }); return; }
    if (files.length + list.length > MAX_FILES) { toast(`最多 ${MAX_FILES} 个附件`, { tone: 'bad' }); return; }
    setFiles((x) => [...x, ...list]);
  };

  const add = async (files: Blob[]) => {
    const room = MAX_IMAGES - images.length;
    if (files.length > room) toast(`最多 ${MAX_IMAGES} 张截图`, { tone: 'bad' });
    const out = await Promise.all(files.slice(0, room).map(shrinkImage));
    setImages((x) => [...x, ...out]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => Boolean(f));
    if (files.length) { e.preventDefault(); void add(files); }
  };

  const save = useMutation({
    mutationFn: async () => {
      const refs: FileRef[] = [];
      for (const f of files) refs.push(await uploadFile(f, 'feedback_file'));
      return feedbackApi.create({
        kind, text: text.trim(), images, page, pageTitle: title,
        userId: me.user.id, userName: me.user.name, roleNames: me.user.roleNames.join('、'),
        ua: navigator.userAgent, screen: `${window.innerWidth}×${window.innerHeight}`, version: __BUILD__,
        attachments: refs, attachmentIds: refs.map((r) => r.id),
      });
    },
    onSuccess: (f) => {
      toast(`已提交，编号 ${f.no}，处理结果可在 帮助 › 问题反馈 里查看`);
      void qc.invalidateQueries({ queryKey: ['feedback'] });
      onDone();
    },
    onError: (e: Error) => toast(e.message, { tone: 'bad' }),
  });

  return (
      <div className="fb-form">
        <Seg label="类型" value={kind} onChange={setKind} options={[{ value: '问题', label: '问题' }, { value: '建议', label: '建议' }, { value: '咨询', label: '咨询' }]} />
        <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste}
          placeholder={kind === '问题' ? '做了什么操作、看到了什么、本来应该是什么样' : kind === '建议' ? '希望怎么改，为什么' : '想了解什么'} aria-label="反馈内容" />
        <div className="fb-imgs">
          {images.map((src, i) => (
            <div key={i} className="fb-img">
              <img src={src} alt={`截图 ${i + 1}`} />
              <button type="button" className="btn btn-sm btn-ds" aria-label="删除截图" onClick={async () => { if (await deleteConfirm('截图')) { setImages((x) => x.filter((_, j) => j !== i)); } }}><Icon name="x" />删除</button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <label className="fb-add">
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
              <Icon name="plus" /><span>截图</span>
            </label>
          )}
        </div>
        <div className="fb-files">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="fb-file">
              <Icon name="package" /><span title={f.name}>{f.name}</span><em>{(f.size / 1024 / 1024).toFixed(1)} MB</em>
              <button type="button" className="btn btn-sm btn-ds" aria-label={`删除附件 ${f.name}`} onClick={async () => { if (await deleteConfirm(`附件 ${f.name}`)) { setFiles((x) => x.filter((_, j) => j !== i)); } }}><Icon name="x" />删除</button>
            </div>
          ))}
          {files.length < MAX_FILES && (
            <label className="btn btn-sm fb-add-file">
              <input type="file" accept={FILE_ACCEPT} multiple hidden onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
              <Icon name="package" /><span>添加附件</span>
            </label>
          )}
        </div>
        <p className="fg3 fb-tip">可直接在输入框里粘贴截图（Win+Shift+S 截屏后 Ctrl+V）。需求文档、表格等附件单个不超过 {MAX_FILE_MB}MB，最多 {MAX_FILES} 个。提交时会附上当前页面、账号和浏览器信息。</p>
        <div className="fb-form-row">
          <button type="button" className="btn btn-p" disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}><Icon name="check" />{save.isPending ? '提交中…' : '提交'}</button>
        </div>
      </div>
  );
}

/** 电脑端外壳里的悬浮入口：右边竖着的「问题反馈」，点开是右侧面板 */
export function FeedbackDock() {
  const [open, setOpen] = useState(false);
  const title = usePageTitle();
  const loc = useLocation();
  if (!open) {
    return (
      <button type="button" className="ai-fab" aria-label="问题反馈" onClick={() => setOpen(true)}>
        <Icon name="mail" /><span>问题反馈</span>
      </button>
    );
  }
  return (
    <aside className="ai as-panel" role="dialog" aria-label="问题反馈">
      <div className="ai-h"><Icon name="mail" className="i ai-mark" /><b>问题反馈</b><span className="ai-ctx" title={loc.pathname}>当前页面：{title}</span>
        <button type="button" className="btn btn-g btn-sm" onClick={() => setOpen(false)}><Icon name="x" />关闭</button>
      </div>
      <div className="ai-b"><FeedbackForm onDone={() => setOpen(false)} /></div>
    </aside>
  );
}
