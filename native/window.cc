#include <node_api.h>
#include <windows.h>
#include <algorithm>

static HWND host = nullptr;
static HWND owner = nullptr;
static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_SETFOCUS || msg == WM_LBUTTONDOWN) { SetFocus(owner); return 0; }
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
  WNDCLASSW cls={};cls.lpfnWndProc=WindowProc;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=L"RoundhouseVideoHost";cls.hbrBackground=(HBRUSH)GetStockObject(BLACK_BRUSH);
  RegisterClassW(&cls);
  host=CreateWindowExW(WS_EX_NOACTIVATE,cls.lpszClassName,L"",WS_CHILD|WS_CLIPCHILDREN|WS_CLIPSIBLINGS,0,0,1,1,owner,nullptr,cls.hInstance,nullptr);
  if(!host){napi_throw_error(env,nullptr,"Could not create video host");return nullptr;}
  napi_value result;napi_create_uint32(env,static_cast<uint32_t>(reinterpret_cast<uintptr_t>(host)),&result);return result;
}
static napi_value Bounds(napi_env env,napi_callback_info info){
  size_t count=5;napi_value args[5];napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  if(count!=5){napi_throw_error(env,nullptr,"Expected x, y, width, height, visible");return nullptr;}
  double v[4];bool visible;
  for(int i=0;i<4;i++) if(napi_get_value_double(env,args[i],&v[i])!=napi_ok){napi_throw_type_error(env,nullptr,"Invalid bounds");return nullptr;}
  napi_get_value_bool(env,args[4],&visible);
  if(host){const double scale=GetDpiForWindow(owner)/96.0;
    SetWindowPos(host,HWND_TOP,static_cast<int>(v[0]*scale),static_cast<int>(v[1]*scale),std::max(1,static_cast<int>(v[2]*scale)),std::max(1,static_cast<int>(v[3]*scale)),SWP_NOACTIVATE);
    ShowWindow(host,visible?SW_SHOWNOACTIVATE:SW_HIDE);
  }
  napi_value result;napi_get_undefined(env,&result);return result;
}
static napi_value Destroy(napi_env env,napi_callback_info){if(host){DestroyWindow(host);host=nullptr;}napi_value result;napi_get_undefined(env,&result);return result;}
static napi_value Init(napi_env env,napi_value exports){
  napi_property_descriptor methods[]={{"create",nullptr,Create,nullptr,nullptr,nullptr,napi_default,nullptr},{"bounds",nullptr,Bounds,nullptr,nullptr,nullptr,napi_default,nullptr},{"destroy",nullptr,Destroy,nullptr,nullptr,nullptr,napi_default,nullptr}};
  napi_define_properties(env,exports,3,methods);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
