import React, { useState } from 'react'
import { Button, Input, Select, Space, Spin, Tag } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ExperimentOutlined,
  LoadingOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons'
import type { SessionStatus } from '../../shared/types'
import { ANALYSIS_PURPOSES } from '../../shared/types'

interface ControlBarProps {
  status: SessionStatus | null
  onStart: () => void
  onPause: () => void
  onStop: () => void
  onAnalyze: (purpose?: string) => void
  hasRequests: boolean
  isAnalyzing?: boolean
}

const ControlBar: React.FC<ControlBarProps> = ({
  status,
  onStart,
  onPause,
  onStop,
  onAnalyze,
  hasRequests,
  isAnalyzing = false
}) => {
  const [purposeId, setPurposeId] = useState<string>('auto')
  const [customText, setCustomText] = useState('')
  const [customExpanded, setCustomExpanded] = useState(false)

  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isStopped = status === 'stopped' || status === null

  const handlePurposeChange = (value: string) => {
    if (value === 'custom') {
      setCustomExpanded(true)
    } else {
      setPurposeId(value)
      setCustomExpanded(false)
    }
  }

  const handleCustomConfirm = () => {
    const trimmed = customText.trim()
    if (trimmed) {
      setPurposeId('custom')
      setCustomExpanded(false)
    }
  }

  const handleCustomCancel = () => {
    setCustomExpanded(false)
    // 如果之前不是 custom，恢复原选择
    if (purposeId !== 'custom') {
      setCustomText('')
    }
  }

  const handleAnalyze = () => {
    if (purposeId === 'custom') {
      onAnalyze(customText.trim() || undefined)
    } else if (purposeId === 'auto') {
      onAnalyze(undefined)
    } else {
      onAnalyze(purposeId)
    }
  }

  return (
    <div style={{ flexShrink: 0, background: '#1a1a1a', borderBottom: '1px solid #303030' }}>
      {/* Main control row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
        }}
      >
        <Space size={8}>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            disabled={!isStopped}
            onClick={onStart}
            style={
              isStopped
                ? { background: '#389e0d', borderColor: '#389e0d' }
                : undefined
            }
          >
            Start Capture
          </Button>

          <Button
            icon={<PauseCircleOutlined />}
            disabled={!isRunning}
            onClick={onPause}
            style={
              isRunning
                ? { color: '#faad14', borderColor: '#faad14' }
                : undefined
            }
          >
            Pause
          </Button>

          <Button
            danger
            icon={<StopOutlined />}
            disabled={!(isRunning || isPaused)}
            onClick={onStop}
          >
            Stop
          </Button>

          <Select
            value={customExpanded ? 'custom' : purposeId}
            onChange={handlePurposeChange}
            style={{ width: 160 }}
            disabled={isAnalyzing}
            options={ANALYSIS_PURPOSES.map(p => ({
              label: p.label,
              value: p.value,
            }))}
          />

          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            disabled={!(isStopped && hasRequests) || isAnalyzing}
            loading={isAnalyzing}
            onClick={handleAnalyze}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </Space>

        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {purposeId === 'custom' && customText.trim() && !customExpanded && (
            <Tag color="blue" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customText.trim()}
            </Tag>
          )}
          {isRunning && (
            <Tag
              color="green"
              icon={<Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Capturing...
            </Tag>
          )}
          {isPaused && <Tag color="warning">Paused</Tag>}
          {isStopped && status !== null && <Tag color="default">Stopped</Tag>}
        </div>
      </div>

      {/* Inline custom purpose input */}
      {customExpanded && (
        <div
          style={{
            padding: '0 12px 8px',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <Input.TextArea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="输入你希望 AI 重点分析的内容，例如：分析用户注册流程中的所有加密操作"
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{ flex: 1 }}
            autoFocus
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleCustomConfirm()
              }
            }}
          />
          <Button
            type="primary"
            icon={<CheckOutlined />}
            disabled={!customText.trim()}
            onClick={handleCustomConfirm}
            size="small"
            style={{ marginTop: 2 }}
          />
          <Button
            icon={<CloseOutlined />}
            onClick={handleCustomCancel}
            size="small"
            style={{ marginTop: 2 }}
          />
        </div>
      )}
    </div>
  )
}

export default ControlBar
