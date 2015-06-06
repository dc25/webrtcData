COMMON_SOURCES = 
TYPESCRIPT_SOURCES = webrtc.ts

JAVASCRIPT_FROM_TYPESCRIPT = $(patsubst %.ts,%.js, $(TYPESCRIPT_SOURCES))

default:all

%.js: %.ts
	tsc $< 


all: $(JAVASCRIPT_FROM_TYPESCRIPT)

clean:
	-rm *~
	-rm *.hi
	-rm *.o
	-rm $(JAVASCRIPT_FROM_TYPESCRIPT)

