// Original Windows floating companion implementation for this fork.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

public static class PetJson {
  public static Dictionary<string,object> Obj(object value) {return value as Dictionary<string,object> ?? new Dictionary<string,object>();}
  public static object Get(object value,string key) {object result;return Obj(value).TryGetValue(key,out result)?result:null;}
  public static string Text(object value,string key) {return Convert.ToString(Get(value,key)) ?? "";}
  public static double Number(object value,string key,double fallback) {try {return Get(value,key)==null?fallback:Convert.ToDouble(Get(value,key));}catch{return fallback;}}
  public static bool Bool(object value,string key,bool fallback) {return Get(value,key) is bool?(bool)Get(value,key):fallback;}
  public static object[] Array(object value) {return value as object[] ?? new object[0];}
  public static Dictionary<string,object> Data(params object[] pairs) {var result=new Dictionary<string,object>();for(int i=0;i<pairs.Length;i+=2)result[(string)pairs[i]]=pairs[i+1];return result;}
}

public class PetLayeredForm : Form {
  public Func<Bitmap> Draw;
  [StructLayout(LayoutKind.Sequential)] struct XY {public int x,y;public XY(int a,int b){x=a;y=b;}}
  [StructLayout(LayoutKind.Sequential)] struct DIM {public int x,y;public DIM(int a,int b){x=a;y=b;}}
  [StructLayout(LayoutKind.Sequential,Pack=1)] struct BLEND {public byte op,flags,alpha,format;}
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc,IntPtr item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr item);
  [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dst,ref XY position,ref DIM size,IntPtr source,ref XY origin,int key,ref BLEND blend,int flags);
  public PetLayeredForm() {FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;AutoScaleMode=AutoScaleMode.None;Cursor=Cursors.Hand;}
  protected override bool ShowWithoutActivation {get{return true;}}
  protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x08000000|0x00080000|0x00000080;return value;}}
  protected override void WndProc(ref Message message) {if(message.Msg==0x0021){message.Result=new IntPtr(3);return;}base.WndProc(ref message);}
  public void PaintFrame() {
    if(!Visible || Draw==null)return;
    using(var bitmap=Draw()) {
      IntPtr screen=GetDC(IntPtr.Zero),memory=CreateCompatibleDC(screen),image=bitmap.GetHbitmap(Color.FromArgb(0)),old=SelectObject(memory,image);
      try{var position=new XY(Left,Top);var size=new DIM(Width,Height);var origin=new XY(0,0);var blend=new BLEND{alpha=255,format=1};UpdateLayeredWindow(Handle,screen,ref position,ref size,memory,ref origin,0,ref blend,2);}
      finally{SelectObject(memory,old);DeleteObject(image);DeleteDC(memory);ReleaseDC(IntPtr.Zero,screen);}
    }
  }
}

public class PetNoticeForm : Form {
  public PetNoticeForm(){FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=false;TopMost=true;StartPosition=FormStartPosition.Manual;AutoScaleMode=AutoScaleMode.None;}
  protected override bool ShowWithoutActivation {get{return true;}}
  protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x08000000|0x00000080;return value;}}
  protected override void WndProc(ref Message message){if(message.Msg==0x0021){message.Result=new IntPtr(3);return;}base.WndProc(ref message);}
  public void Round(int radius){using(var path=new GraphicsPath()){path.AddArc(0,0,radius,radius,180,90);path.AddArc(Width-radius,0,radius,radius,270,90);path.AddArc(Width-radius,Height-radius,radius,radius,0,90);path.AddArc(0,Height-radius,radius,radius,90,90);path.CloseFigure();var old=Region;Region=new Region(path);if(old!=null)old.Dispose();}}
}

public static class DshDesktopPet {
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(Point point,uint flags);
  [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr monitor,int type,out uint x,out uint y);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr window,int index);
  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern bool Process32First(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern bool Process32Next(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)] struct ProcessEntry {public uint size,usage,pid;public IntPtr heap;public uint module,threads,parent;public int priority;public uint flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;}
  static int ParentOf(int pid){var snapshot=CreateToolhelp32Snapshot(2,0);try{var entry=new ProcessEntry();entry.size=(uint)Marshal.SizeOf(entry);if(Process32First(snapshot,ref entry))do{if(entry.pid==(uint)pid)return (int)entry.parent;}while(Process32Next(snapshot,ref entry));return 0;}finally{CloseHandle(snapshot);}}
  static Process ownerProcess;
  static string ownerExecutable;
  static void FocusDsh(){int pid=parent;for(int i=0;i<8 && pid>0;i++){try{var process=Process.GetProcessById(pid);var handle=process.MainWindowHandle;if(handle!=IntPtr.Zero && ownerExecutable!=null && string.Equals(process.MainModule.FileName,ownerExecutable,StringComparison.OrdinalIgnoreCase)){ShowWindow(handle,9);SetForegroundWindow(handle);return;}}catch{}pid=ParentOf(pid);}}
  static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=64000000};
  static readonly object outputLock=new object();
  static readonly ConcurrentQueue<Dictionary<string,object>> incoming=new ConcurrentQueue<Dictionary<string,object>>();
  static PetLayeredForm pet;
  static PetNoticeForm notices;
  static Bitmap sprites;
  static Dictionary<string,object> config=new Dictionary<string,object>(),animations=new Dictionary<string,object>(),snapshot;
  static string signature="",pose="idle",language="zh";
  static float scale=1;
  static int parent,frame,version=1,sizeDip=120,imageRevision=0;
  static string lastPaint="";
  static long nextFrame,jumpUntil,waveUntil;
  static bool moving=false,showNotices=true,closing=false;
  static Point downMouse,downWindow;
  static Form requestWindow;
  static Label requestError;
  static string requestPendingId;
  static readonly Dictionary<string,Font> fonts=new Dictionary<string,Font>();
  static readonly Stopwatch clock=Stopwatch.StartNew();
  static string T(string zh,string en){return language.StartsWith("en",StringComparison.OrdinalIgnoreCase)?en:zh;}
  static void Emit(object value){lock(outputLock){Console.WriteLine(json.Serialize(value));Console.Out.Flush();}}
  static string SendCommand(Dictionary<string,object> value){if(PetJson.Text(value,"type")=="open")FocusDsh();string id=Guid.NewGuid().ToString("N");Emit(PetJson.Data("type","command","id",id,"command",value));return id;}
  static void UpdateConfig(object value){Emit(PetJson.Data("type","config","value",value));}
  static float ScreenScale(Screen screen){try{uint x,y;GetDpiForMonitor(MonitorFromPoint(new Point(screen.WorkingArea.Left+1,screen.WorkingArea.Top+1),2),0,out x,out y);return Math.Max(1,x/96f);}catch{return 1;}}
  static Screen PositionScreen(object position){foreach(var screen in Screen.AllScreens)if(screen.DeviceName==PetJson.Text(position,"screen"))return screen;return Screen.PrimaryScreen;}
  static void Position(object position){var screen=PositionScreen(position);scale=ScreenScale(screen);SetSize();var area=screen.WorkingArea;double x=PetJson.Number(position,"x",.96),y=PetJson.Number(position,"y",.96);pet.Location=new Point(area.Left+(int)(Math.Max(0,area.Width-pet.Width)*x),area.Top+(int)(Math.Max(0,area.Height-pet.Height)*y));LayoutNotices();}
  static void SetSize(){pet.Size=new Size((int)Math.Round(sizeDip*scale),(int)Math.Round(sizeDip*208d/192*scale+12*scale));}
  static void SavePosition(){var screen=Screen.FromRectangle(pet.Bounds);var area=screen.WorkingArea;UpdateConfig(PetJson.Data("desktopPosition",PetJson.Data("screen",screen.DeviceName,"x",Math.Max(0,Math.Min(1,(pet.Left-area.Left)/(double)Math.Max(1,area.Width-pet.Width))),"y",Math.Max(0,Math.Min(1,(pet.Top-area.Top)/(double)Math.Max(1,area.Height-pet.Height))))));}
  static void Clamp(){var area=Screen.FromRectangle(pet.Bounds).WorkingArea;pet.Left=Math.Max(area.Left,Math.Min(area.Right-pet.Width,pet.Left));pet.Top=Math.Max(area.Top,Math.Min(area.Bottom-pet.Height,pet.Top));}
  static Point Cell(){
      var animation=PetJson.Get(animations,pose);int row=(int)PetJson.Number(animation,"row",0),column=frame;
      if(version==2 && pose=="idle"){
        double dx=Cursor.Position.X-(pet.Left+pet.Width/2d),dy=Cursor.Position.Y-(pet.Top+pet.Height/2d);
        if(Math.Sqrt(dx*dx+dy*dy)>28*scale){int index=((int)Math.Round((Math.Atan2(dx,-dy)+Math.PI*2)%(Math.PI*2)/(Math.PI/8)))%16;row=9+index/8;column=index%8;}
      }
      column=Math.Max(0,Math.Min(7,column));row=Math.Max(0,Math.Min(version==2?10:8,row));
      return new Point(column,row);
  }
  static Bitmap Render(){
    var bitmap=new Bitmap(Math.Max(1,pet.Width),Math.Max(1,pet.Height),PixelFormat.Format32bppPArgb);
    if(sprites==null)return bitmap;
    using(var graphics=Graphics.FromImage(bitmap)){
      graphics.Clear(Color.Transparent);graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;graphics.CompositingQuality=CompositingQuality.HighQuality;
      var cell=Cell();int column=cell.X,row=cell.Y;
      graphics.DrawImage(sprites,new RectangleF(0,6*scale,pet.Width,pet.Height-12*scale),new RectangleF(column*192,row*208,192,208),GraphicsUnit.Pixel);
    }return bitmap;
  }
  static void Advance(){
    string next=moving?(Cursor.Position.X>=downMouse.X?"running-right":"running-left"):clock.ElapsedMilliseconds<jumpUntil?"jumping":clock.ElapsedMilliseconds<waveUntil?"waving":PetJson.Text(PetJson.Get(PetJson.Get(snapshot,"notifications"),"activity"),"pose");
    if(!animations.ContainsKey(next))next="idle";
    if(pose!=next){pose=next;frame=0;nextFrame=0;}
    var durations=PetJson.Array(PetJson.Get(PetJson.Get(animations,pose),"durations"));
    if(clock.ElapsedMilliseconds>=nextFrame && durations.Length>0){frame=(frame+1)%durations.Length;nextFrame=clock.ElapsedMilliseconds+Convert.ToInt32(durations[frame]);}
    string painted=Cell()+":"+pet.Bounds+":"+imageRevision;
    if(painted!=lastPaint){lastPaint=painted;pet.PaintFrame();}
  }
  static Font TextFont(float size,bool bold){string key=size+":"+bold+":"+scale;Font value;if(!fonts.TryGetValue(key,out value)){value=new Font("Microsoft YaHei UI",size*scale,bold?FontStyle.Bold:FontStyle.Regular,GraphicsUnit.Pixel);fonts[key]=value;}return value;}
  static Label TextLabel(string text,int x,int y,int width,int height,bool bold){return new Label{Text=text,AutoEllipsis=true,Location=new Point(x,y),Size=new Size(width,height),Font=TextFont(bold?13:12,bold),BackColor=Color.Transparent};}
  static Button Button(string text,int x,int y,int width,Action action){var button=new Button{Text=text,Location=new Point(x,y),Size=new Size(width,(int)(30*scale)),FlatStyle=FlatStyle.Flat,Cursor=Cursors.Hand,Font=TextFont(12,false),TabStop=false};button.FlatAppearance.BorderSize=0;button.Click+=(sender,e)=>action();return button;}
  static Dictionary<string,object> Command(object item,string type){return PetJson.Data("type",type,"id",PetJson.Text(item,"id"),"token",PetJson.Text(item,"token"));}
  static void LayoutNotices(){
    if(notices==null)return;var area=Screen.FromRectangle(pet.Bounds).WorkingArea;
    int left=pet.Left-notices.Width-(int)(12*scale);if(left<area.Left)left=pet.Right+(int)(12*scale);
    notices.Location=new Point(Math.Max(area.Left,Math.Min(area.Right-notices.Width,left)),Math.Max(area.Top,Math.Min(area.Bottom-notices.Height,pet.Bottom-notices.Height)));
  }
  static void BuildNotices(){
    while(notices.Controls.Count>0)notices.Controls[0].Dispose();
    var items=PetJson.Array(PetJson.Get(PetJson.Get(snapshot,"notifications"),"items"));
    if(items.Length==0 || !showNotices || !PetJson.Bool(config,"visible",true)){notices.Hide();return;}
    int width=(int)(300*scale),rowHeight=(int)(74*scale),gap=(int)(8*scale);
    var area=Screen.FromRectangle(pet.Bounds).WorkingArea;
    notices.Size=new Size(Math.Min(width,area.Width),Math.Min((int)(420*scale),Math.Min(area.Height,rowHeight*items.Length+gap*2)));
    notices.BackColor=Color.FromArgb(246,248,251);notices.Round((int)(24*scale));
    var flow=new FlowLayoutPanel{Dock=DockStyle.Fill,AutoScroll=true,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(gap),BackColor=notices.BackColor};notices.Controls.Add(flow);
    foreach(var item in items){
      var current=item;var card=new Panel{Width=notices.Width-gap*2-(int)(20*scale),Height=rowHeight-gap,BackColor=Color.White,Margin=new Padding(0,0,0,gap)};
      var title=TextLabel(PetJson.Text(item,"title"),(int)(10*scale),(int)(7*scale),card.Width-(int)(92*scale),(int)(22*scale),true);
      string state=PetJson.Text(item,"pose");string label=state=="running"?T("正在工作","Working"):state=="waiting"?T("等待你处理","Needs your attention"):state=="failed"?T("任务出错","Task failed"):T("已完成","Completed");
      var status=TextLabel(label,(int)(10*scale),(int)(32*scale),card.Width-(int)(92*scale),(int)(20*scale),false);status.ForeColor=Color.FromArgb(110,117,130);
      title.Cursor=Cursors.Hand;status.Cursor=Cursors.Hand;title.Click+=(sender,e)=>SendCommand(Command(current,"open"));status.Click+=(sender,e)=>SendCommand(Command(current,"open"));
      card.Controls.Add(title);card.Controls.Add(status);
      int right=card.Width-(int)(31*scale);
      card.Controls.Add(Button("×",right,(int)(3*scale),(int)(28*scale),()=>SendCommand(Command(current,"dismiss"))));
      if(PetJson.Get(item,"request")!=null)card.Controls.Add(Button("?",right-(int)(30*scale),(int)(28*scale),(int)(28*scale),()=>Request(current)));
      else card.Controls.Add(Button("↗",right-(int)(30*scale),(int)(28*scale),(int)(28*scale),()=>SendCommand(Command(current,"open"))));
      if(state=="running")card.Controls.Add(Button("■",right,(int)(28*scale),(int)(28*scale),()=>SendCommand(Command(current,"stop"))));
      flow.Controls.Add(card);
    }
    LayoutNotices();notices.Show();
  }
  static void Request(object item){
    if(requestWindow!=null && !requestWindow.IsDisposed){requestWindow.Activate();return;}
    var request=PetJson.Get(item,"request");
    var form=new Form{Text=T("DSH · 待处理请求","DSH · Request"),Width=(int)(480*scale),Height=(int)(500*scale),StartPosition=FormStartPosition.CenterScreen,TopMost=true,MinimizeBox=false,MaximizeBox=false,Font=TextFont(13,false),BackColor=Color.White};requestWindow=form;
    var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,AutoScroll=true,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding((int)(16*scale))};form.Controls.Add(panel);
    int width=(int)(410*scale);
    Func<string,Label> label=text=>new Label{Text=text,AutoSize=true,MaximumSize=new Size(width,0),Margin=new Padding(0,5,0,9),Font=TextFont(13,false)};
    var baseValue=Command(item,"answer");baseValue["requestKey"]=PetJson.Text(request,"key");
    requestError=label("");requestError.ForeColor=Color.Firebrick;
    Action<Dictionary<string,object>> submit=value=>{requestError.Text=T("正在提交…","Submitting…");requestPendingId=SendCommand(value);};
    if(PetJson.Text(request,"kind")=="approval"){
      panel.Controls.Add(label(PetJson.Text(request,"toolName")));panel.Controls.Add(label(PetJson.Text(request,"reason")));
      var reject=new Dictionary<string,object>(baseValue);reject["type"]="reject";
      var approve=new Dictionary<string,object>(baseValue);approve["type"]="approve";
      var actions=new FlowLayoutPanel{Width=width,Height=(int)(50*scale)};
      actions.Controls.Add(Button(T("拒绝","Reject"),0,0,(int)(120*scale),()=>submit(reject)));
      actions.Controls.Add(Button(T("仅允许一次","Allow once"),0,0,(int)(160*scale),()=>submit(approve)));panel.Controls.Add(actions);
    }else{
      var readers=new List<Func<object>>();
      foreach(var question in PetJson.Array(PetJson.Get(request,"questions"))){
        var q=question;panel.Controls.Add(label(PetJson.Text(q,"question")));string detail=PetJson.Text(q,"detail");if(detail!="")panel.Controls.Add(label(detail));
        bool multiple=PetJson.Bool(q,"multiSelect",false);var options=new List<ButtonBase>();
        var group=new Panel{Width=width,Height=1};int top=0;
        foreach(var option in PetJson.Array(PetJson.Get(q,"options"))){
          ButtonBase control=multiple?(ButtonBase)new CheckBox():(ButtonBase)new RadioButton();control.Text=PetJson.Text(option,"label");control.Tag=control.Text;control.Font=TextFont(13,false);control.Location=new Point(0,top);control.Size=new Size(width,(int)(32*scale));top+=control.Height;options.Add(control);group.Controls.Add(control);
        }
        group.Height=Math.Max(1,top);panel.Controls.Add(group);
        var custom=new TextBox{Width=width,Height=(int)(68*scale),Multiline=true,MaxLength=10000,ScrollBars=ScrollBars.Vertical};panel.Controls.Add(custom);
        custom.TextChanged+=(sender,e)=>{if(!multiple && custom.Text.Length>0)foreach(var option in options)((RadioButton)option).Checked=false;};
        foreach(var option in options){var selected=option;selected.Click+=(sender,e)=>{if(!multiple)custom.Text="";};}
        readers.Add(()=>{var selected=new List<string>();foreach(var option in options)if(option is CheckBox?((CheckBox)option).Checked:((RadioButton)option).Checked)selected.Add((string)option.Tag);return PetJson.Data("id",PetJson.Text(q,"id"),"selected",selected.ToArray(),"custom",custom.Text);});
      }
      panel.Controls.Add(Button(T("提交回答","Submit answers"),0,0,(int)(170*scale),()=>{var answers=new List<object>();foreach(var reader in readers)answers.Add(reader());var value=new Dictionary<string,object>(baseValue);value["answers"]=PetJson.Data("answers",answers.ToArray());submit(value);}));
    }
    panel.Controls.Add(requestError);form.FormClosed+=(sender,e)=>{requestWindow=null;requestError=null;};form.Show();form.Activate();
  }
  static void Menu(){
    var menu=new ContextMenuStrip();menu.Items.Add(T("跳一下","Jump"),null,(sender,e)=>{jumpUntil=clock.ElapsedMilliseconds+700;});
    menu.Items.Add(T("打个招呼","Wave"),null,(sender,e)=>{waveUntil=clock.ElapsedMilliseconds+700;});
    menu.Items.Add(showNotices?T("收起任务通知","Hide task notifications"):T("显示任务通知","Show task notifications"),null,(sender,e)=>{showNotices=!showNotices;BuildNotices();});
    menu.Items.Add(new ToolStripSeparator());menu.Items.Add(T("宠物设置","Pet settings"),null,(sender,e)=>{FocusDsh();Emit(PetJson.Data("type","settings"));});
    menu.Items.Add(T("重置位置","Reset position"),null,(sender,e)=>{Position(null);UpdateConfig(PetJson.Data("desktopPosition",null));});
    menu.Items.Add(T("收起宠物","Hide companion"),null,(sender,e)=>{pet.Hide();notices.Hide();UpdateConfig(PetJson.Data("visible",false));});
    menu.Items.Add(T("返回页内显示","Show inside DSH"),null,(sender,e)=>UpdateConfig(PetJson.Data("desktop",false)));
    menu.Closed+=(sender,e)=>menu.Dispose();menu.Show(Cursor.Position);
  }
  static void Handle(Dictionary<string,object> message){
    var type=PetJson.Text(message,"type");
    if(type=="close"){closing=true;pet.Close();return;}
    if(type=="snapshot"){
      string oldPosition=json.Serialize(PetJson.Get(config,"desktopPosition"));int oldSize=sizeDip;string oldLanguage=language;
      snapshot=message;config=PetJson.Obj(PetJson.Get(message,"config"));animations=PetJson.Obj(PetJson.Get(message,"animations"));language=PetJson.Text(message,"language");version=(int)PetJson.Number(message,"version",1);sizeDip=(int)PetJson.Number(config,"size",120);
      string image=PetJson.Text(message,"image");if(image!=""){using(var input=new MemoryStream(Convert.FromBase64String(image)))using(var loaded=Image.FromStream(input)){var next=new Bitmap(loaded);var old=sprites;sprites=next;imageRevision++;if(old!=null)old.Dispose();}}
      if(oldSize!=sizeDip || oldPosition!=json.Serialize(PetJson.Get(config,"desktopPosition")) || !pet.Visible)Position(PetJson.Get(config,"desktopPosition"));
      string nextSignature=json.Serialize(PetJson.Get(PetJson.Get(message,"notifications"),"items"))+language+sizeDip;
      if(signature!=nextSignature || oldLanguage!=language){signature=nextSignature;BuildNotices();}
      if(PetJson.Bool(config,"visible",true) && sprites!=null){pet.Show();pet.PaintFrame();if(showNotices && PetJson.Array(PetJson.Get(PetJson.Get(message,"notifications"),"items")).Length>0)notices.Show();}
      else{pet.Hide();notices.Hide();}
      Emit(PetJson.Data("type","shown","id",PetJson.Text(message,"id")));return;
    }
    if(type=="result"){
      if(PetJson.Text(message,"id")!=requestPendingId)return;
      if(PetJson.Bool(message,"ok",false)){if(requestWindow!=null)requestWindow.Close();requestPendingId=null;}
      else if(requestError!=null)requestError.Text=PetJson.Text(message,"error");
      return;
    }
    if(type=="inspect"){
      string image="";using(var bitmap=Render())using(var buffer=new MemoryStream()){bitmap.Save(buffer,ImageFormat.Png);image=Convert.ToBase64String(buffer.ToArray());}
      var area=Screen.FromRectangle(pet.Bounds).WorkingArea;
      Emit(PetJson.Data("type","inspection","id",PetJson.Text(message,"id"),"pid",Process.GetCurrentProcess().Id,"visible",pet.Visible,"topmost",pet.TopMost,"handle",pet.Handle.ToInt64(),"foreground",GetForegroundWindow().ToInt64(),"styles",GetWindowLong(pet.Handle,-20),"bounds",PetJson.Data("x",pet.Left,"y",pet.Top,"width",pet.Width,"height",pet.Height),"workArea",PetJson.Data("x",area.X,"y",area.Y,"width",area.Width,"height",area.Height),"scale",scale,"pose",pose,"noticesVisible",notices.Visible,"image",image));
    }
  }
  public static void Run(int parentPid){
    try{if(!SetProcessDpiAwarenessContext(new IntPtr(-4)))SetProcessDPIAware();}catch{SetProcessDPIAware();}
    Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);parent=parentPid;
    try{ownerProcess=Process.GetProcessById(parentPid);ownerExecutable=ownerProcess.MainModule.FileName;}catch{return;}
    Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
    pet=new PetLayeredForm();notices=new PetNoticeForm();pet.Draw=Render;Position(null);
    pet.MouseDown+=(sender,e)=>{if(e.Button==MouseButtons.Left){downMouse=Cursor.Position;downWindow=pet.Location;moving=true;pet.Capture=true;}};
    pet.MouseMove+=(sender,e)=>{if(moving){var point=Cursor.Position;pet.Location=new Point(downWindow.X+point.X-downMouse.X,downWindow.Y+point.Y-downMouse.Y);Clamp();float nextScale=ScreenScale(Screen.FromRectangle(pet.Bounds));if(nextScale!=scale){scale=nextScale;SetSize();signature="";BuildNotices();}LayoutNotices();pet.PaintFrame();}};
    pet.MouseUp+=(sender,e)=>{if(moving){moving=false;pet.Capture=false;SavePosition();}if(e.Button==MouseButtons.Right)Menu();};
    pet.MouseDoubleClick+=(sender,e)=>{if(e.Button==MouseButtons.Left)jumpUntil=clock.ElapsedMilliseconds+700;};
    pet.FormClosed+=(sender,e)=>{closing=true;if(notices!=null)notices.Close();if(requestWindow!=null)requestWindow.Close();Application.ExitThread();};
    var timer=new System.Windows.Forms.Timer{Interval=33};int ticks=0;
    timer.Tick+=(sender,e)=>{
      Dictionary<string,object> message;int count=0;
      while(count++<12 && incoming.TryDequeue(out message)){try{Handle(message);}catch(Exception error){Emit(PetJson.Data("type","native-error","error",error.Message));}}
      if(closing)return;Advance();
      if(++ticks%30==0){try{if(ownerProcess.HasExited)pet.Close();}catch{pet.Close();}}
    };
    var reader=new Thread(()=>{var decoder=new JavaScriptSerializer{MaxJsonLength=64000000};try{string line;while((line=Console.ReadLine())!=null){if(line.Length>64000000)throw new Exception("Desktop input exceeds limit");incoming.Enqueue(PetJson.Obj(decoder.DeserializeObject(line)));}}catch{}finally{incoming.Enqueue(PetJson.Data("type","close"));}});reader.IsBackground=true;reader.Start();
    EventHandler displays=(sender,e)=>{if(!closing && pet.IsHandleCreated)try{pet.BeginInvoke((Action)(()=>{if(closing)return;Position(PetJson.Get(config,"desktopPosition"));signature="";BuildNotices();}));}catch{}};
    SystemEvents.DisplaySettingsChanged+=displays;
    pet.CreateControl();var handle=pet.Handle;timer.Start();Emit(PetJson.Data("type","ready","pid",Process.GetCurrentProcess().Id));
    Application.Run(new ApplicationContext());timer.Stop();timer.Dispose();
    SystemEvents.DisplaySettingsChanged-=displays;ownerProcess.Dispose();
    if(sprites!=null)sprites.Dispose();pet.Dispose();notices.Dispose();
    foreach(var font in fonts.Values)font.Dispose();
  }
}
