-- #1019, Orion 1.1.3: reads and clicks the probe box over AppleScript, the way keyprobe-cdp.ts and keyprobe-bidi.ts
-- do for the throwaway Chrome and Firefox. Needs Orion's Develop › Allow JavaScript from Apple Events (on, on the
-- owner's Orion) and Automation permission for Orion (granted). None of it touches how a key reaches Orion: the
-- presses come from keyprobe-press.swift.
--
-- Prints nothing about a tab whose URL does not contain the given text, since the owner's own tabs are in the same
-- windows.
--
-- Usage: osascript orion.applescript js <url-part> <javascript>   the first matching tab's result
--        osascript orion.applescript urls <url-part>              every matching tab's URL
--        osascript orion.applescript close <url-part>             closes every matching tab
--        osascript orion.applescript windows                      how many windows Orion has open
on run argv
	set verb to item 1 of argv
	tell application "Orion"
		if verb is "windows" then return (count of windows) as text
		set part to item 2 of argv
		set found to {}
		repeat with w in windows
			repeat with t in tabs of w
				set u to ""
				try
					set u to URL of t
				end try
				if u contains part then set end of found to t
			end repeat
		end repeat
		if verb is "urls" then
			set out to ""
			repeat with t in found
				set out to out & (URL of t) & linefeed
			end repeat
			return out
		end if
		if verb is "close" then
			set n to count of found
			repeat with t in found
				close t
			end repeat
			return "closed " & n
		end if
		if verb is "js" then
			if (count of found) is 0 then error "no tab whose URL contains " & part
			return (do JavaScript (item 3 of argv) in (item 1 of found)) as text
		end if
	end tell
	error "verbs: js <url-part> <javascript> | urls <url-part> | close <url-part> | windows"
end run
