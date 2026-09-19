#include <node_api.h>
#include <windows.h>
#include <algorithm>
#include <cmath>

static HWND host = nullptr;
static HWND owner = nullptr;
static volatile LONG clickCount = 0;
static volatile LONG doubleClickCount = 0;
static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  // Chromium's last cursor may be the split-view resize cursor. Child video
  // receives mouse events itself, so explicitly restore the arrow on entry.
  if (msg == WM_SETCURSOR && LOWORD(lp) == HTCLIENT) { SetCursor(LoadCursor(nullptr, IDC_ARROW)); return TRUE; }
  if (msg == WM_SETFOCUS) { SetFocus(owner); return 0; }
  if (msg == WM_LBUTTONDOWN) { InterlockedIncrement(&clickCount); SetFocus(owner); return 0; }
  if (msg == WM_LBUTTONDBLCLK) { InterlockedIncrement(&doubleClickCount); SetFocus(owner); return 0; }
  if (msg == WM_MOUSEACTIVATE) return MA_NOACTIVATE;
  return DefWindowProcW(hwnd, msg, wp, lp);
}
static napi_value Create(napi_env env, napi_callback_info info) {
  size_t count=1, length=0; napi_value args[1]; void* bytes=nullptr;
  napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  bool is_buffer=false; if(count) napi_is_buffer(env,args[0],&is_buffer);
  if(!is_buffer || napi_get_buffer_info(env,args[0],&bytes,&length)!=napi_ok || length<sizeof(HWND)) {
    napi_throw_error(env,nullptr,"Expected Electron's native window handle"); return nullptr;
  }
  owner=*reinterpret_cast<HWND*>(bytes);
  if(!IsWindow(owner)){napi_throw_error(env,nullptr,"Invalid parent window");return nullptr;}
  if(host) DestroyWindow(host);
  InterlockedExchange(&clickCount,0);InterlockedExchange(&doubleClickCount,0);
  WNDCLASSW cls={};cls.style=CS_DBLCLKS;cls.lpfnWndProc=WindowProc;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=L"RoundhouseVideoHost";cls.hbrBackground=(HBRUSH)GetStockObject(BLACK_BRUSH);
  RegisterClassW(&cls);
  host=CreateWindowExW(WS_EX_NOACTIVATE,cls.lpszClassName,L"",WS_CHILD|WS_CLIPCHILDREN|WS_CLIPSIBLINGS,0,0,1,1,owner,nullptr,cls.hInstance,nullptr);
  if(!host){napi_throw_error(env,nullptr,"Could not create video host");return nullptr;}
  napi_value result;napi_create_uint32(env,static_cast<uint32_t>(reinterpret_cast<uintptr_t>(host)),&result);return result;
}
static napi_value Bounds(napi_env env,napi_callback_info info){
  size_t count=13;napi_value args[13];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  if(count!=5 && count!=7 && count!=11 && count!=12 && count!=13){napi_throw_error(env,nullptr,"Expected bounds, visibility, and optional clipping");return nullptr;}
  double v[4];bool visible;
  for(int i=0;i<4;i++) if(napi_get_value_double(env,args[i],&v[i])!=napi_ok){napi_throw_type_error(env,nullptr,"Invalid bounds");return nullptr;}
  napi_get_value_bool(env,args[4],&visible);
  double top=0,bottom=0;
  if(count>=7 && (napi_get_value_double(env,args[5],&top)!=napi_ok || napi_get_value_double(env,args[6],&bottom)!=napi_ok)){
    napi_throw_type_error(env,nullptr,"Invalid overlay heights");return nullptr;
  }
  double clip[4]={0,0,1,1};
  if(count>=11) for(int i=0;i<4;i++) {
    if(napi_get_value_double(env,args[7+i],&clip[i])!=napi_ok || !std::isfinite(clip[i])) {
      napi_throw_type_error(env,nullptr,"Invalid video clipping");return nullptr;
    }
    clip[i]=std::clamp(clip[i],0.0,1.0);
  }
  double holes[64];uint32_t holeCount=0;
  if(count>=12) {
    bool array=false;napi_is_array(env,args[11],&array);
    if(!array || napi_get_array_length(env,args[11],&holeCount)!=napi_ok || holeCount>64 || holeCount%4) {
      napi_throw_type_error(env,nullptr,"Invalid overlay rectangles");return nullptr;
    }
    for(uint32_t i=0;i<holeCount;i++) {
      napi_value item;napi_get_element(env,args[11],i,&item);
      if(napi_get_value_double(env,item,&holes[i])!=napi_ok || !std::isfinite(holes[i]) || holes[i]<0 || holes[i]>100000) {
        napi_throw_type_error(env,nullptr,"Invalid overlay rectangle");return nullptr;
      }
    }
  }
  double radius=0;
  if(count==13 && (napi_get_value_double(env,args[12],&radius)!=napi_ok || !std::isfinite(radius) || radius<0 || radius>128)) {
    napi_throw_type_error(env,nullptr,"Invalid corner radius");return nullptr;
  }
  if(host){const double scale=GetDpiForWindow(owner)/96.0;
    SetWindowPos(host,HWND_TOP,static_cast<int>(v[0]*scale),static_cast<int>(v[1]*scale),std::max(1,static_cast<int>(v[2]*scale)),std::max(1,static_cast<int>(v[3]*scale)),SWP_NOACTIVATE);
    // Chromium cannot paint over a child HWND. Cut out only the visible toolbar
    // bands; the video client rectangle stays full-sized, so mpv never rescales.
    const int width=std::max(1,static_cast<int>(v[2]*scale));
    const int height=std::max(1,static_cast<int>(v[3]*scale));
    const int clipTop=std::clamp(static_cast<int>(top*scale),0,height);
    const int clipBottom=std::clamp(static_cast<int>(bottom*scale),0,height-clipTop);
    // Expose Chromium's ambient background only in the actual letterbox bars.
    // Keep the HWND's full client size so MPV's video geometry never changes.
    const int regionLeft=static_cast<int>(clip[0]*width),regionTop=std::max(clipTop,static_cast<int>(clip[1]*height));
    const int regionRight=static_cast<int>(clip[2]*width),regionBottom=std::min(height-clipBottom,static_cast<int>(clip[3]*height));
    const int rounded=static_cast<int>(radius*scale*2);
    HRGN region=rounded>0?CreateRoundRectRgn(regionLeft,regionTop,regionRight+1,regionBottom+1,rounded,rounded):CreateRectRgn(regionLeft,regionTop,regionRight,regionBottom);
    for(uint32_t i=0;i<holeCount;i+=4) {
      HRGN hole=CreateRectRgn(static_cast<int>(std::floor(holes[i]*scale)),static_cast<int>(std::floor(holes[i+1]*scale)),
        static_cast<int>(std::ceil((holes[i]+holes[i+2])*scale)),static_cast<int>(std::ceil((holes[i+1]+holes[i+3])*scale)));
      CombineRgn(region,region,hole,RGN_DIFF);DeleteObject(hole);
    }
    if(!SetWindowRgn(host,region,TRUE)) DeleteObject(region);
    ShowWindow(host,visible?SW_SHOWNOACTIVATE:SW_HIDE);
  }
  napi_value result;napi_get_undefined(env,&result);return result;
}
static napi_value Geometry(napi_env env,napi_callback_info info){
  napi_value result;napi_create_object(env,&result);
  if(host){
    RECT client={},clip={};GetClientRect(host,&client);
    HRGN region=CreateRectRgn(0,0,0,0);GetWindowRgn(host,region);GetRgnBox(region,&clip);
    size_t count=2;napi_value args[2];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
    if(count==2) {
      double x=0,y=0;napi_get_value_double(env,args[0],&x);napi_get_value_double(env,args[1],&y);
      const double scale=GetDpiForWindow(owner)/96.0;
      napi_value contains;napi_get_boolean(env,PtInRegion(region,static_cast<int>(x*scale),static_cast<int>(y*scale)),&contains);
      napi_set_named_property(env,result,"contains",contains);
    }
    DeleteObject(region);
    const char* keys[]={"width","height","top","bottom","left","right"};
    int values[]={client.right,client.bottom,clip.top,clip.bottom,clip.left,clip.right};
    for(int i=0;i<6;i++){napi_value value;napi_create_int32(env,values[i],&value);napi_set_named_property(env,result,keys[i],value);}
  }
  return result;
}
static napi_value Destroy(napi_env env,napi_callback_info){if(host){DestroyWindow(host);host=nullptr;}InterlockedExchange(&clickCount,0);InterlockedExchange(&doubleClickCount,0);napi_value result;napi_get_undefined(env,&result);return result;}
static napi_value ConsumeClicks(napi_env env,napi_callback_info){napi_value result;napi_create_int32(env,InterlockedExchange(&clickCount,0),&result);return result;}
static napi_value ConsumeDoubleClicks(napi_env env,napi_callback_info){napi_value result;napi_create_int32(env,InterlockedExchange(&doubleClickCount,0),&result);return result;}
static napi_value Init(napi_env env,napi_value exports){
  napi_property_descriptor methods[]={{"create",nullptr,Create,nullptr,nullptr,nullptr,napi_default,nullptr},{"bounds",nullptr,Bounds,nullptr,nullptr,nullptr,napi_default,nullptr},{"destroy",nullptr,Destroy,nullptr,nullptr,nullptr,napi_default,nullptr},{"geometry",nullptr,Geometry,nullptr,nullptr,nullptr,napi_default,nullptr},{"consumeClicks",nullptr,ConsumeClicks,nullptr,nullptr,nullptr,napi_default,nullptr},{"consumeDoubleClicks",nullptr,ConsumeDoubleClicks,nullptr,nullptr,nullptr,napi_default,nullptr}};
  napi_define_properties(env,exports,6,methods);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
