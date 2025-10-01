# Cursor Freezing Investigation

## System-Level Debugging Checklist

Since the cursor freezing affects multiple websites, investigate these system-level issues:

### 1. Memory Pressure
```bash
# Check memory usage
top -l 1 -s 0 | grep "PhysMem"
vm_stat

# Look for high memory pressure
memory_pressure
```

### 2. GPU and Graphics
```bash
# Check GPU processes
sudo powermetrics -i 1000 -n 1 --show-process-gpu

# Monitor WindowServer (handles cursor rendering)
top -pid `pgrep WindowServer`
```

### 3. Browser Process Analysis
```bash
# Check Chrome/browser memory usage
ps aux | grep -i chrome | head -10

# Monitor browser GPU usage
Activity Monitor > GPU History tab
```

### 4. System Performance
```bash
# Check for high CPU processes
top -o cpu

# Check disk I/O (can cause freezing)
iostat 2

# Check if any processes are in uninterruptible sleep
ps axl | awk '$8 ~ /D/ { print $2, $13 }'
```

### 5. Browser-Specific Checks

#### Disable Extensions
1. Open Chrome in incognito mode (disables most extensions)
2. Test if cursor issue persists
3. If resolved, methodically disable extensions

#### Hardware Acceleration
1. Go to chrome://settings/system
2. Toggle "Use hardware acceleration when available"
3. Restart browser and test

#### Clear Browser Data
1. Clear cache, cookies, localStorage
2. Test with fresh browser profile

### 6. macOS-Specific Issues

#### Check Console Logs
```bash
# Look for WindowServer errors
log show --last 1h --predicate 'subsystem == "com.apple.WindowServer"'

# Check for GPU errors
log show --last 1h --predicate 'category == "GPU"'
```

#### Reset NVRAM/PRAM (if GPU issues suspected)
```bash
# Restart and hold: Option + Command + P + R
# Until you hear startup sound twice
```

### 7. Correlation Testing

#### CloudFront Cache Invalidation
Since you mentioned correlation with CloudFront cache invalidations:

1. Monitor network activity during cursor freezing:
   ```bash
   sudo netstat -i 1
   ```

2. Check if large downloads are happening:
   - Chrome DevTools > Network tab
   - Look for large resource downloads during freeze

3. Test with cache disabled:
   - DevTools > Network > Disable cache
   - Hard reload and test

### 8. Immediate Workarounds

If this is urgent, try:

1. **Force cursor refresh**:
   ```javascript
   // In browser console during freeze
   document.body.style.cursor = 'default';
   setTimeout(() => document.body.style.cursor = '', 100);
   ```

2. **Reduce browser memory**:
   - Close unused tabs
   - Restart browser periodically
   - Use smaller browser windows

3. **Monitor memory in our app**:
   ```javascript
   // Add to main.js for monitoring
   setInterval(() => {
     if (performance.memory) {
       console.log('Memory:', {
         used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + 'MB',
         total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + 'MB',
         limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + 'MB'
       });
     }
   }, 30000); // Every 30 seconds
   ```

## Action Items

1. ✅ Fixed auto-save regression in AnalysisLM forms
2. ✅ Implemented comprehensive jobs cleanup
3. 🔄 Monitor memory usage during cursor freezing
4. 🔄 Test cursor behavior with browser extensions disabled
5. 🔄 Check correlation with CloudFront cache invalidations
6. 🔄 Monitor system logs during freezing events

## Notes

- Cursor freezing affecting multiple websites suggests system-level issue
- May be related to memory pressure, GPU, or browser extensions
- CloudFront correlation needs investigation
- Auto-save regression has been resolved