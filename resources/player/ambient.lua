local mp = require 'mp'
local sample_id = 0
-- Called at most once every three seconds by the host, only while visible.
-- Readback remains inside MPV. Only a 6x4 palette crosses the control pipe;
-- there is no screenshot encoder, disk write, second decoder, or frame loop.
mp.register_script_message('roundhouse-ambient-sample', function()
    local started = mp.get_time()
    local frame = mp.command_native({ 'screenshot-raw', 'video', 'bgr0' })
    if not frame or not frame.data or frame.stride <= 0 then return end
    local colors = {}
    for row = 0, 3 do
        for col = 0, 5 do
            local r, g, b = 0, 0, 0
            for sy = 1, 3 do
                for sx = 1, 3 do
                    local x = math.min(frame.w - 1, math.floor((col + sx / 4) * frame.w / 6))
                    local y = math.min(frame.h - 1, math.floor((row + sy / 4) * frame.h / 4))
                    local offset = y * frame.stride + x * 4 + 1
                    local pb, pg, pr = frame.data:byte(offset, offset + 2)
                    r, g, b = r + pr, g + pg, b + pb
                end
            end
            colors[#colors + 1] = { math.floor(r / 9), math.floor(g / 9), math.floor(b / 9) }
        end
    end
    frame = nil
    sample_id = sample_id + 1
    mp.set_property_native('user-data/roundhouse/ambient', { colors = colors, sampleMs = (mp.get_time() - started) * 1000, sampleId = sample_id })
    collectgarbage('collect')
end)
