import React from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import {
  composeRecordingChromeSpec,
  type RecordingChromeAlignment,
  type RecordingChromeSpec,
  type RecordingChromeStyle,
} from "./spec"

export interface RecordingChromeStatus {
  elapsed: string
  blinkOn?: boolean
  stopHint?: string
}

export interface RecordingChromeProps {
  chrome?: RecordingChromeStyle
  spec?: RecordingChromeSpec
  alignment?: RecordingChromeAlignment
  title?: string
  status?: RecordingChromeStatus | false
  children: React.ReactNode
}

function StatusLine(props: { status: RecordingChromeStatus }): React.ReactElement {
  const { elapsed, blinkOn = true, stopHint = "Ctrl+D to stop" } = props.status
  return (
    <Box flexDirection="row">
      <Text color={blinkOn ? "red" : undefined}>{blinkOn ? "●" : " "}</Text>
      <Text>{` REC ${elapsed}  `}</Text>
      <Text color="$fg-muted">{`· ${stopHint}`}</Text>
    </Box>
  )
}

function TitleBar(props: { spec: RecordingChromeSpec }): React.ReactElement | null {
  const { spec } = props
  const titleBar = spec.live.titleBar
  if (titleBar === null) return null

  if (titleBar.controlsSide === "right") {
    return (
      <Box flexDirection="row" paddingX={1}>
        <Text bold>{spec.title}</Text>
        <Box flexGrow={1} />
        {titleBar.controls.map((control, index) => (
          <React.Fragment key={`${control.glyph}-${index}`}>
            {index > 0 && <Text>{"  "}</Text>}
            <Text color={control.color}>{control.glyph}</Text>
          </React.Fragment>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="row" paddingX={1}>
      {titleBar.controls.map((control, index) => (
        <React.Fragment key={`${control.glyph}-${index}`}>
          {index > 0 && <Text> </Text>}
          <Text color={control.color}>{control.glyph}</Text>
        </React.Fragment>
      ))}
      {titleBar.separator && (
        <>
          <Text>{"  "}</Text>
          <Text color="$fg-muted">{titleBar.separator}</Text>
          <Text>{"  "}</Text>
        </>
      )}
      <Text bold>{spec.title}</Text>
    </Box>
  )
}

export function RecordingChrome(props: RecordingChromeProps): React.ReactElement {
  const spec =
    props.spec ??
    composeRecordingChromeSpec({
      style: props.chrome,
      title: props.title,
      alignment: props.alignment,
    })

  const alignItems = spec.alignment === "left" ? ("flex-start" as const) : ("center" as const)
  const status =
    props.status === false ? null : <StatusLine status={props.status ?? { elapsed: "0:00" }} />

  const rootProps = {
    flexDirection: "column" as const,
    justifyContent: "center" as const,
    alignItems,
    width: "100%" as const,
    height: "100%" as const,
    backgroundColor: "$bg",
  }

  if (spec.live.borderStyle === "none") {
    return (
      <Box {...rootProps}>
        {status}
        {status && <Box />}
        {props.children}
      </Box>
    )
  }

  return (
    <Box {...rootProps}>
      {status}
      {status && <Box />}
      <Box borderStyle={spec.live.borderStyle} flexDirection="column">
        <TitleBar spec={spec} />
        {props.children}
      </Box>
    </Box>
  )
}
